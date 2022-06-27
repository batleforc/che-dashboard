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

import { FactoryResolver, DevfileV2ProjectSource } from '../../services/helpers/types';
import devfileApi from '../../services/devfileApi';
import { getProjectName } from '../../services/helpers/getProjectName';
import { safeDump } from 'js-yaml';
import {
  DEVWORKSPACE_DEVFILE_SOURCE,
  DEVWORKSPACE_METADATA_ANNOTATION,
} from '../../services/workspace-client/devworkspace/devWorkspaceClient';
import { V220DevfileComponents } from '@devfile/api';

/**
 * Returns a devfile from the FactoryResolver object.
 * @param devfile a Devfile.
 * @param data a FactoryResolver object.
 * @param location a source location.
 * @param defaultComponents Default components. These default components
 * are meant to be used when a Devfile does not contain any components.
 */
export default function normalizeDevfileV2(
  devfile: devfileApi.Devfile,
  data: FactoryResolver,
  location: string,
  defaultComponents: V220DevfileComponents[],
): devfileApi.Devfile {
  const scmInfo = data['scm_info'];

  devfile = devfile as devfileApi.Devfile;
  if (!devfile.components || devfile.components.length === 0) {
    devfile.components = defaultComponents;
  }

  // temporary solution for fix che-server serialization bug with empty volume
  const components =
    devfile.components.map(component => {
      if (Object.keys(component).length === 1 && component.name) {
        component.volume = {};
      }
      return component;
    }) || [];
  devfile = Object.assign(devfile, { components });

  // add a default project
  const projects: DevfileV2ProjectSource[] = [];
  if (!devfile.projects?.length && scmInfo) {
    const origin = scmInfo.clone_url;
    const name = getProjectName(origin);
    const revision = scmInfo.branch;
    const project: DevfileV2ProjectSource = { name, git: { remotes: { origin } } };
    if (revision) {
      project.git.checkoutFrom = { revision };
    }
    projects.push(project);
    devfile = Object.assign({ projects }, devfile);
  }

  // provide metadata about the origin of the devfile with DevWorkspace
  let devfileSource = '';
  if (data.source && scmInfo) {
    if (scmInfo.branch) {
      devfileSource = safeDump({
        scm: {
          repo: scmInfo['clone_url'],
          revision: scmInfo.branch,
          fileName: data.source,
        },
      });
    } else {
      devfileSource = safeDump({
        scm: {
          repo: scmInfo['clone_url'],
          fileName: data.source,
        },
      });
    }
  } else if (location) {
    devfileSource = safeDump({ url: { location } });
  }
  if (!devfile.metadata) {
    devfile.metadata = {} as devfileApi.DevfileMetadata;
  }
  const metadata = devfile.metadata;
  if (!metadata.attributes) {
    metadata.attributes = {};
  }
  if (!metadata.attributes[DEVWORKSPACE_METADATA_ANNOTATION]) {
    metadata.attributes[DEVWORKSPACE_METADATA_ANNOTATION] = {};
  }
  metadata.attributes[DEVWORKSPACE_METADATA_ANNOTATION][DEVWORKSPACE_DEVFILE_SOURCE] =
    devfileSource;
  if (!metadata.name && !metadata.generateName) {
    metadata.generateName = getProjectName(scmInfo?.clone_url || location);
  }
  devfile = Object.assign({}, devfile, { metadata });

  return devfile;
}
