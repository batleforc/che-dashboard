/*
 * Copyright (c) 2018-2024 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionToggle,
  Button,
  FormHelperText,
  Panel,
  PanelMain,
  PanelMainBody,
  ValidatedOptions,
} from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';
import { History } from 'history';
import React from 'react';
import { connect, ConnectedProps } from 'react-redux';

import { AdvancedOptions } from '@/components/ImportFromGit/AdvancedOptions';
import { GitRepoOptions } from '@/components/ImportFromGit/GitRepoOptions';
import {
  getGitRepoOptionsFromLocation,
  setGitRepoOptionsToLocation,
  validateLocation,
} from '@/components/ImportFromGit/helpers';
import { GitRemote } from '@/components/WorkspaceProgress/CreatingSteps/Apply/Devfile/getGitRemotes';
import { FactoryLocationAdapter } from '@/services/factory-location-adapter';
import { buildUserPreferencesLocation } from '@/services/helpers/location';
import { UserPreferencesTab } from '@/services/helpers/types';
import { AppState } from '@/store';
import { selectSshKeys } from '@/store/SshKeys/selectors';

type AccordionId = 'git-repo-options' | 'advanced-options';

export type Props = MappedProps & {
  location: string;
  onChange: (location: string, remotesValidated: ValidatedOptions) => void;
  history: History;
};
export type State = {
  location: string;
  hasSshKeys: boolean;
  expandedId: AccordionId | undefined;
  gitBranch: string | undefined;
  remotes: GitRemote[] | undefined;
  remotesValidated: ValidatedOptions;
  devfilePath: string | undefined;
  containerImage: string | undefined;
  temporaryStorage: boolean | undefined;
  createNewIfExisting: boolean | undefined;
  memoryLimit: number | undefined;
  cpuLimit: number | undefined;
  hasSupportedGitService: boolean;
};

class RepoOptionsAccordion extends React.PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);

    const { location } = props;

    this.state = {
      hasSupportedGitService: false,
      location,
      hasSshKeys: props.sshKeys.length > 0,
      expandedId: undefined,
      gitBranch: undefined,
      remotes: undefined,
      remotesValidated: ValidatedOptions.default,
      devfilePath: undefined,
      containerImage: undefined,
      temporaryStorage: undefined,
      createNewIfExisting: undefined,
      memoryLimit: undefined,
      cpuLimit: undefined,
    };
  }

  public componentDidUpdate() {
    const { location } = this.props;

    if (this.state.location === location.trim()) {
      return;
    }
    const validated = validateLocation(location, this.state.hasSshKeys);
    if (validated !== ValidatedOptions.success) {
      return;
    }
    this.setState(getGitRepoOptionsFromLocation(location) as State);
  }

  private getErrorMessage(location: string): string | React.ReactNode {
    const isValidGitSsh = FactoryLocationAdapter.isSshLocation(location);

    if (isValidGitSsh && !this.state.hasSshKeys) {
      return (
        <FormHelperText icon={<ExclamationCircleIcon />} isHidden={false} isError={true}>
          No SSH keys found. Please add your SSH keys in the{' '}
          <Button variant="link" isInline onClick={() => this.openUserPreferences()}>
            User Preferences
          </Button>{' '}
          and then try again.
        </FormHelperText>
      );
    }

    return 'The URL or SSHLocation is not valid.';
  }

  private openUserPreferences(): void {
    const location = buildUserPreferencesLocation(UserPreferencesTab.SSH_KEYS);
    this.props.history.push(location);
  }

  private handleToggle(id: AccordionId): void {
    const { expandedId } = this.state;
    this.setState({
      expandedId: expandedId === id ? undefined : id,
    });
  }

  private handleGitRepoOptionsChange(
    gitBranch: string | undefined,
    remotes: GitRemote[] | undefined,
    devfilePath: string | undefined,
    isValid: boolean,
  ): void {
    const state = setGitRepoOptionsToLocation(
      { gitBranch, remotes, devfilePath },
      {
        location: this.state.location,
        gitBranch: this.state.gitBranch,
        remotes: this.state.remotes,
        devfilePath: this.state.devfilePath,
      },
    ) as State;
    state.remotesValidated = isValid ? ValidatedOptions.success : ValidatedOptions.error;
    this.setState(state);
    this.props.onChange(state.location, state.remotesValidated);
  }

  public render() {
    const { hasSupportedGitService } = this.state;
    const { expandedId, remotes, devfilePath, gitBranch } = this.state;
    const { containerImage, temporaryStorage, createNewIfExisting, memoryLimit, cpuLimit } =
      this.state;
    return (
      <Accordion asDefinitionList={false}>
        <AccordionItem>
          <AccordionToggle
            onClick={() => {
              this.handleToggle('git-repo-options');
            }}
            isExpanded={expandedId === 'git-repo-options'}
            id="accordion-item-git-repo-options"
          >
            Git Repo Options
          </AccordionToggle>

          <AccordionContent
            isHidden={expandedId !== 'git-repo-options'}
            data-testid="options-content"
          >
            <Panel>
              <PanelMain>
                <PanelMainBody>
                  <GitRepoOptions
                    gitBranch={gitBranch}
                    remotes={remotes}
                    devfilePath={devfilePath}
                    hasSupportedGitService={hasSupportedGitService}
                    onChange={(gitBranch, remotes, devfilePath, isValid) =>
                      this.handleGitRepoOptionsChange(gitBranch, remotes, devfilePath, isValid)
                    }
                  />
                </PanelMainBody>
              </PanelMain>
            </Panel>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem>
          <AccordionToggle
            onClick={() => {
              this.handleToggle('advanced-options');
            }}
            isExpanded={expandedId === 'advanced-options'}
            id="accordion-item-advanced-options"
          >
            Advanced Options
          </AccordionToggle>

          <AccordionContent
            isHidden={expandedId !== 'git-repo-options'}
            data-testid="options-content"
          >
            <Panel>
              <PanelMain>
                <PanelMainBody>
                  <AdvancedOptions
                    containerImage={containerImage}
                    temporaryStorage={temporaryStorage}
                    createNewIfExisting={createNewIfExisting}
                    memoryLimit={memoryLimit}
                    cpuLimit={cpuLimit}
                    onChange={(
                      containerImage,
                      temporaryStorage,
                      createNewIfExisting,
                      memoryLimit,
                      cpuLimit,
                    ) =>
                      this.handleAdvancedOptionsOptionsChange(
                        containerImage,
                        temporaryStorage,
                        createNewIfExisting,
                        memoryLimit,
                        cpuLimit,
                      )
                    }
                  />
                </PanelMainBody>
              </PanelMain>
            </Panel>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }
}

const mapStateToProps = (state: AppState) => ({
  sshKeys: selectSshKeys(state),
});

const connector = connect(mapStateToProps);

type MappedProps = ConnectedProps<typeof connector>;
export default connector(RepoOptionsAccordion);
