/*
 * Copyright (c) 2018-2021 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { inject, injectable } from 'inversify';
import { InversifyBinding } from '@eclipse-che/che-theia-devworkspace-handler/lib/inversify/inversify-binding';
import { CheTheiaPluginsDevfileResolver } from '@eclipse-che/che-theia-devworkspace-handler/lib/devfile/che-theia-plugins-devfile-resolver';
import common from '@eclipse-che/common';
import { SidecarPolicy } from '@eclipse-che/che-theia-devworkspace-handler/lib/api/devfile-context';
import { isWebTerminal } from '../../helpers/devworkspace';
import { WorkspaceClient } from '../index';
import devfileApi, { IPatch, isDevWorkspace } from '../../devfileApi';
import {
  devWorkspaceApiGroup, devworkspaceSingularSubresource, devworkspaceVersion
} from './converters';
import { AlertItem, DevWorkspaceStatus } from '../../helpers/types';
import { KeycloakSetupService } from '../../keycloak/setup';
import { delay } from '../../helpers/delay';
import * as DwApi from '../../dashboard-backend-client/devWorkspaceApi';
import * as DwtApi from '../../dashboard-backend-client/devWorkspaceTemplateApi';
import * as DwCheApi from '../../dashboard-backend-client/cheWorkspaceApi';
import { WebsocketClient, SubscribeMessage } from '../../dashboard-backend-client/websocketClient';
import { getId, getStatus } from '../../workspace-adapter/helper';
import { EventEmitter } from 'events';
import { AppAlerts } from '../../alerts/appAlerts';
import { AlertVariant } from '@patternfly/react-core';

export interface IStatusUpdate {
  error?: string;
  message?: string;
  status?: string;
  prevStatus?: string;
  workspaceId: string;
}

export type Subscriber = {
  namespace: string,
  callbacks: {
    getResourceVersion: () => Promise<string|undefined>,
    updateDevWorkspaceStatus: (message: IStatusUpdate) => void,
    updateDeletedDevWorkspaces: (deletedWorkspacesIds: string[]) => void,
    updateAddedDevWorkspaces: (workspace: devfileApi.DevWorkspace[]) => void,
  }
};

export const DEVWORKSPACE_NEXT_START_ANNOTATION = 'che.eclipse.org/next-start-cfg';

export const DEVWORKSPACE_DEVFILE_SOURCE = 'che.eclipse.org/devfile-source';

export const DEVWORKSPACE_METADATA_ANNOTATION = 'dw.metadata.annotations';

/**
 * This class manages the connection between the frontend and the devworkspace typescript library
 */
@injectable()
export class DevWorkspaceClient extends WorkspaceClient {
  private subscriber: Subscriber | undefined;
  private previousItems: Map<string, Map<string, IStatusUpdate>>;
  private readonly maxStatusAttempts: number;
  private lastDevWorkspaceLog: Map<string, string>;
  private readonly pluginRegistryUrlEnvName: string;
  private readonly pluginRegistryInternalUrlEnvName: string;
  private readonly dashboardUrlEnvName: string;
  private readonly websocketClient: WebsocketClient;
  private webSocketEventEmitter: EventEmitter;
  private readonly webSocketEventName: string;
  private readonly _failingWebSockets: string[];
  private readonly showAlert: (alert: AlertItem) => void;

  constructor(@inject(KeycloakSetupService) keycloakSetupService: KeycloakSetupService,
              @inject(AppAlerts) appAlerts: AppAlerts) {
    super(keycloakSetupService);
    this.previousItems = new Map();
    this.maxStatusAttempts = 10;
    this.lastDevWorkspaceLog = new Map();
    this.pluginRegistryUrlEnvName = 'CHE_PLUGIN_REGISTRY_URL';
    this.pluginRegistryInternalUrlEnvName = 'CHE_PLUGIN_REGISTRY_INTERNAL_URL';
    this.dashboardUrlEnvName = 'CHE_DASHBOARD_URL';
    this.webSocketEventEmitter = new EventEmitter();
    this.webSocketEventName = 'websocketClose';
    this._failingWebSockets = [];

    this.showAlert = (alert: AlertItem) => appAlerts.showAlert(alert);

    this.websocketClient = new WebsocketClient({
      onDidWebSocketFailing: (websocketContext: string) => {
        this._failingWebSockets.push(websocketContext);
        this.webSocketEventEmitter.emit(this.webSocketEventName);
      },
      onDidWebSocketOpen: (websocketContext: string) => {
        const index = this._failingWebSockets.indexOf(websocketContext);
        if (index !== -1) {
          this._failingWebSockets.splice(index, 1);
          this.webSocketEventEmitter.emit(this.webSocketEventName);
        }
        this.subscribe().catch(e => {
          const key = 'websocket-subscribe-error';
          const title = `Websocket '${websocketContext}' subscribe Error: ${e}`;
          this.showAlert({ key, variant: AlertVariant.danger, title });
        });
      },
      onDidWebSocketClose: (event: CloseEvent) => {
        if(event.code !== 1011 && event.reason) {
          const key = `websocket-close-code-${event.code}`;
          this.showAlert({ key, variant: AlertVariant.warning, title: 'Failed to establish WebSocket to server: ' + event.reason });
        } else {
          console.warn('WebSocket close', event);
        }
      }
    });
  }

  onWebSocketFailed(callback: () => void) {
    this.webSocketEventEmitter.on(this.webSocketEventName, callback);
  }

  removeWebSocketFailedListener() {
    this.webSocketEventEmitter.removeAllListeners(this.webSocketEventName);
    this._failingWebSockets.length = 0;
  }

  get failingWebSockets(): string[] {
    return Array.from(this._failingWebSockets);
  }

  async getAllWorkspaces(defaultNamespace: string): Promise<{ workspaces: devfileApi.DevWorkspace[]; resourceVersion: string }> {
    const { items, metadata: { resourceVersion } } = await DwApi.listWorkspacesInNamespace(defaultNamespace);
    const workspaces: devfileApi.DevWorkspace[] = [];
    for (const item of items) {
      if (!isWebTerminal(item)) {
        workspaces.push(item);
      }
    }
    return { workspaces, resourceVersion };
  }

  async getWorkspaceByName(namespace: string, workspaceName: string): Promise<devfileApi.DevWorkspace> {
    let workspace = await DwApi.getWorkspaceByName(namespace, workspaceName);
    let attempted = 0;
    while ((!workspace.status || !workspace.status.phase || !workspace.status.mainUrl) && attempted < this.maxStatusAttempts) {
      workspace = await DwApi.getWorkspaceByName(namespace, workspaceName);
      this.checkForDevWorkspaceError(workspace);
      attempted += 1;
      await delay();
    }
    this.checkForDevWorkspaceError(workspace);
    const workspaceStatus = workspace?.status;
    if (!workspaceStatus || !workspaceStatus.phase) {
      throw new Error(`Could not retrieve devworkspace status information from ${workspaceName} in namespace ${namespace}`);
    } else if (workspaceStatus.phase === DevWorkspaceStatus.RUNNING && !workspaceStatus?.mainUrl) {
      throw new Error('Could not retrieve mainUrl for the running workspace');
    }
    return workspace;
  }

  async create(devfile: devfileApi.Devfile,
    defaultNamespace: string,
    pluginsDevfile: devfileApi.Devfile[],
    pluginRegistryUrl: string | undefined,
    pluginRegistryInternalUrl: string | undefined,
    optionalFilesContent: {[fileName: string]: string},
  ): Promise<devfileApi.DevWorkspace> {
    if (!devfile.components) {
      devfile.components = [];
    }

    const createdWorkspace = await DwApi.createWorkspace(devfile, defaultNamespace, false);
    const namespace = createdWorkspace.metadata.namespace;
    const name = createdWorkspace.metadata.name;
    const workspaceId = getId(createdWorkspace);

    const devfileGroupVersion = `${devWorkspaceApiGroup}/${devworkspaceVersion}`;
    const devWorkspaceTemplates: devfileApi.DevWorkspaceTemplateLike[] = [];
    for (const pluginDevfile of pluginsDevfile) {
      // TODO handle error in a proper way
      const pluginName = this.normalizePluginName(pluginDevfile.metadata.name, workspaceId);

      const theiaDWT = {
        kind: 'DevWorkspaceTemplate',
        apiVersion: devfileGroupVersion,
        metadata: {
          name: pluginName,
          namespace,
        },
        spec: pluginDevfile
      };
      devWorkspaceTemplates.push(theiaDWT);
    }

    const devWorkspace: devfileApi.DevWorkspace = createdWorkspace;
    // call theia library to insert all the logic
    const inversifyBindings = new InversifyBinding();
    const container = await inversifyBindings.initBindings({
      pluginRegistryUrl: pluginRegistryUrl || '',
      axiosInstance: this.axios,
      insertTemplates: false,
    });
    const cheTheiaPluginsContent = optionalFilesContent['.che/che-theia-plugins.yaml'];
    const vscodeExtensionsJsonContent = optionalFilesContent['.vscode/extensions.json'];
    const cheTheiaPluginsDevfileResolver = container.get(CheTheiaPluginsDevfileResolver);

    let sidecarPolicy: SidecarPolicy;
    const devfileCheTheiaSidecarPolicy = (devfile as devfileApi.DevWorkspaceSpecTemplate).attributes?.['che-theia.eclipse.org/sidecar-policy'];
    if (devfileCheTheiaSidecarPolicy === 'USE_DEV_CONTAINER') {
      sidecarPolicy = SidecarPolicy.USE_DEV_CONTAINER;
    } else {
      sidecarPolicy = SidecarPolicy.MERGE_IMAGE;
    }
    console.debug('Loading devfile', devfile, 'with optional .che/che-theia-plugins.yaml', cheTheiaPluginsContent, 'and .vscode/extensions.json', vscodeExtensionsJsonContent, 'with sidecar policy', sidecarPolicy);
    // call library to update devWorkspace and add optional templates
    try {
      await cheTheiaPluginsDevfileResolver.handle({
        devfile,
        cheTheiaPluginsContent,
        vscodeExtensionsJsonContent,
        devWorkspace,
        devWorkspaceTemplates,
        sidecarPolicy,
        suffix: workspaceId,
      });
    } catch (e) {
      console.error(e);
      const errorMessage = common.helpers.errors.getMessage(e);
      throw new Error(`Unable to resolve theia plugins: ${errorMessage}`);
    }
    console.debug('Devfile updated to', devfile, ' and templates updated to', devWorkspaceTemplates);

    await Promise.all(devWorkspaceTemplates.map(async template => {
      if (!template.metadata) {
        template.metadata = {};
      }

      // Update the namespace
      (template.metadata as any).namespace = namespace;

      // Update owner reference (to allow automatic cleanup)
      (template.metadata as any).ownerReferences = [
        {
          apiVersion: devfileGroupVersion,
          kind: devworkspaceSingularSubresource,
          name: createdWorkspace.metadata.name,
          uid: createdWorkspace.metadata.uid
        }
      ];

      // propagate the plugin registry and dashboard urls to the containers in the initial devworkspace templates
      if (template.spec?.components) {
        for (const component of template.spec?.components) {
          const container = component.container;
          if (container) {
            if (!container.env) {
              container.env = [];
            }
            container.env.push(...[{
              name: this.dashboardUrlEnvName,
              value: window.location.origin,
            }, {
              name: this.pluginRegistryUrlEnvName,
              value: pluginRegistryUrl || ''
            }
            , {
              name: this.pluginRegistryInternalUrlEnvName,
              value: pluginRegistryInternalUrl || ''
            }
          ]);
          }
        }
      }

      const pluginDWT = await DwtApi.createTemplate(<devfileApi.DevWorkspaceTemplate>template);
      this.addPlugin(createdWorkspace, pluginDWT.metadata.name, pluginDWT.metadata.namespace);
    }));

    createdWorkspace.spec.started = true;
    const patch = [
      {
        op: 'replace',
        path: '/spec',
        value: createdWorkspace.spec,
      }
    ];
    return DwApi.patchWorkspace(namespace, name, patch);
  }

  /**
   * Update a devworkspace.
   * If the workspace you want to update has the DEVWORKSPACE_NEXT_START_ANNOTATION then
   * patch the cluster object with the value of DEVWORKSPACE_NEXT_START_ANNOTATION and don't restart the devworkspace.
   *
   * If the workspace does not specify DEVWORKSPACE_NEXT_START_ANNOTATION then
   * update the spec of the devworkspace and remove DEVWORKSPACE_NEXT_START_ANNOTATION if it exists.
   *
   * @param workspace The DevWorkspace you want to update
   * @param plugins The plugins you want to inject into the devworkspace
   */
  async update(workspace: devfileApi.DevWorkspace, plugins: devfileApi.Devfile[]): Promise<devfileApi.DevWorkspace> {
    // Take the devworkspace with no plugins and then inject them
    for (const plugin of plugins) {
      if (!plugin.metadata) {
        continue;
      }
      const pluginName = this.normalizePluginName(plugin.metadata.name, getId(workspace));
      this.addPlugin(workspace, pluginName, workspace.metadata.namespace);
    }

    const namespace = workspace.metadata.namespace;
    const name = workspace.metadata.name;

    const patch: IPatch[] = [];

    if (workspace.metadata.annotations && workspace.metadata.annotations[DEVWORKSPACE_NEXT_START_ANNOTATION]) {

      /**
       * This is the case when you are annotating a devworkspace and will restart it later
       */
      patch.push(
        {
          op: 'add',
          path: '/metadata/annotations',
          value: {
            [DEVWORKSPACE_NEXT_START_ANNOTATION]: workspace.metadata.annotations[DEVWORKSPACE_NEXT_START_ANNOTATION]
          }
        },

      );
    } else {
      /**
       * This is the case when you are updating a devworkspace normally
       */
      patch.push(
        {
          op: 'replace',
          path: '/spec',
          value: workspace.spec,
        }
      );
      const onClusterWorkspace = await this.getWorkspaceByName(namespace, name);

      // If the workspace currently has DEVWORKSPACE_NEXT_START_ANNOTATION then delete it since we are starting a devworkspace normally
      if (onClusterWorkspace.metadata.annotations && onClusterWorkspace.metadata.annotations[DEVWORKSPACE_NEXT_START_ANNOTATION]) {
        // We have to escape the slash when removing the annotation and ~1 is used as the escape character https://tools.ietf.org/html/rfc6902#appendix-A.14
        const escapedAnnotation = DEVWORKSPACE_NEXT_START_ANNOTATION.replace('/', '~1');
        patch.push(
          {
            op: 'remove',
            path: `/metadata/annotations/${escapedAnnotation}`,
          }
        );
      }
    }

    return DwApi.patchWorkspace(namespace, name, patch);
  }

  /**
   * Created a normalize plugin name, which is a plugin name with all spaces replaced
   * to dashes and a workspaceId appended at the end
   * @param pluginName The name of the plugin
   * @param workspaceId The id of the workspace
   */
  private normalizePluginName(pluginName: string, workspaceId: string): string {
    return `${pluginName.replaceAll(' ', '-').toLowerCase()}-${workspaceId}`;
  }

  async delete(namespace: string, name: string): Promise<void> {
    await DwApi.deleteWorkspace(namespace, name);
  }

  async changeWorkspaceStatus(namespace: string, name: string, started: boolean): Promise<devfileApi.DevWorkspace> {
    const changedWorkspace = await DwApi.patchWorkspace(namespace, name, [{
      op: 'replace',
      path: '/spec/started',
      value: started
    }]);
    if (!started) {
      this.lastDevWorkspaceLog.delete(getId(changedWorkspace));
    }
    this.checkForDevWorkspaceError(changedWorkspace);
    return changedWorkspace;
  }

  /**
   * Add the plugin to the workspace
   * @param workspace A devworkspace
   * @param pluginName The name of the plugin
   */
  private addPlugin(workspace: devfileApi.DevWorkspace, pluginName: string, namespace: string) {
    if (!workspace.spec.template.components) {
      workspace.spec.template.components = [];
    }
    workspace.spec.template.components.push({
      name: pluginName,
      plugin: {
        kubernetes: {
          name: pluginName,
          namespace
        }
      }
    });
  }

  /**
   * Initialize the given namespace
   * @param namespace The namespace you want to initialize
   * @returns If the namespace has been initialized
   */
  async initializeNamespace(namespace: string): Promise<void> {
    return DwCheApi.initializeNamespace(namespace);
  }

  async subscribeToNamespace(subscriber: Subscriber): Promise<void> {
    this.subscriber = subscriber;
    await this.websocketClient.connect();
  }

  private async subscribe(): Promise<void> {
    if(!this.subscriber) {
      throw 'Error: Subscriber does not set.';
    }

    const { namespace, callbacks } =  this.subscriber;
    const getSubscribeMessage = async (channel: string): Promise<SubscribeMessage> => {
      return { request: 'SUBSCRIBE', params: { namespace, resourceVersion: await callbacks.getResourceVersion() }, channel };
    };

    const onModified = 'onModified';
    await this.websocketClient.subscribe(await getSubscribeMessage(onModified));
    this.websocketClient.addListener(onModified, (devworkspace: unknown) => {
      if (!isDevWorkspace(devworkspace)) {
        const title = `WebSocket channel "${onModified}" received object that is not a devWorkspace, skipping it.`;
        const key = `${onModified}-websocket-channel`;
        console.warn(title , devworkspace);
        this.showAlert({ key, variant: AlertVariant.warning, title });
        return;
      }
      const statusUpdate = this.createStatusUpdate(devworkspace);
      const statusMessage = devworkspace.status?.message;
      if (statusMessage) {
        const workspaceId = getId(devworkspace);
        const lastMessage = this.lastDevWorkspaceLog.get(workspaceId);
        // Only add new messages we haven't seen before
        if (lastMessage !== statusMessage) {
          statusUpdate.message = statusMessage;
          this.lastDevWorkspaceLog.set(workspaceId, statusMessage);
        }
      }
      callbacks.updateDevWorkspaceStatus(statusUpdate);
    });

    const onAdded = 'onAdded';
    await this.websocketClient.subscribe(await getSubscribeMessage(onAdded));
    this.websocketClient.addListener(onAdded, (devworkspace: unknown) => {
      if (!isDevWorkspace(devworkspace)) {
        const title = `WebSocket channel "${onAdded}" received object that is not a devWorkspace, skipping it.`;
        const key = `${onAdded}-websocket-channel`;
        console.warn(title , devworkspace);
        this.showAlert({ key, variant: AlertVariant.warning, title });
        return;
      }
      callbacks.updateAddedDevWorkspaces([devworkspace]);
    });

    const onDeleted = 'onDeleted';
    await this.websocketClient.subscribe(await getSubscribeMessage(onDeleted));
    this.websocketClient.addListener(onDeleted, (maybeWorkspaceId: unknown) => {
      if (typeof(maybeWorkspaceId) !== 'string') {
        const title = `WebSocket channel "${onDeleted}" received value is not a string, skipping it.`;
        const key = `${onDeleted}-websocket-channel`;
        console.warn(title , maybeWorkspaceId, typeof(maybeWorkspaceId));
        this.showAlert({ key, variant: AlertVariant.warning, title });
        return;
      }
      const workspaceId = maybeWorkspaceId as string;
      callbacks.updateDeletedDevWorkspaces([workspaceId]);
    });
  }

  /**
   * Create a status update between the previously receiving DevWorkspace with a certain workspace id
   * and the new DevWorkspace
   * @param devworkspace The incoming DevWorkspace
   */
  private createStatusUpdate(devworkspace: devfileApi.DevWorkspace): IStatusUpdate {
    const namespace = devworkspace.metadata.namespace;
    const workspaceId = getId(devworkspace);
    // Starting devworkspaces don't have status defined
    const status = typeof devworkspace?.status?.phase === 'string'
      ? devworkspace.status.phase
      : DevWorkspaceStatus.STARTING;

    const prevWorkspace = this.previousItems.get(namespace);
    if (prevWorkspace) {
      const prevStatus = prevWorkspace.get(workspaceId);
      const newUpdate: IStatusUpdate = {
        workspaceId: workspaceId,
        status: status,
        prevStatus: prevStatus?.status,
      };
      prevWorkspace.set(workspaceId, newUpdate);
      return newUpdate;
    } else {
      // there is not a previous update
      const newStatus: IStatusUpdate = {
        workspaceId,
        status: status,
        prevStatus: status,
      };

      const newStatusMap = new Map<string, IStatusUpdate>();
      newStatusMap.set(workspaceId, newStatus);
      this.previousItems.set(namespace, newStatusMap);
      return newStatus;
    }
  }

  checkForDevWorkspaceError(devworkspace: devfileApi.DevWorkspace) {
    const currentPhase = getStatus(devworkspace);
    if (currentPhase && currentPhase === DevWorkspaceStatus.FAILED) {
      const message = devworkspace.status?.message;
      if (message) {
        throw new Error(message);
      }
      throw new Error('Unknown error occured when trying to process the devworkspace');
    }
  }
}