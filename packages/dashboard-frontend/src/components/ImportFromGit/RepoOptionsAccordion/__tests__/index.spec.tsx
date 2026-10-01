/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { api } from '@eclipse-che/common';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Provider } from 'react-redux';
import { Store } from 'redux';

import RepoOptionsAccordion from '@/components/ImportFromGit/RepoOptionsAccordion';
import getComponentRenderer, { screen, waitFor } from '@/services/__mocks__/getComponentRenderer';
import { MockStoreBuilder } from '@/store/__mocks__/mockStore';

const { createSnapshot, renderComponent } = getComponentRenderer(getComponent);

jest.mock('@/components/ImportFromGit/RepoOptionsAccordion/AdvancedOptions');
jest.mock('@/components/ImportFromGit/RepoOptionsAccordion/GitRepoOptions');
const mockFetchGitBranches = jest.fn();
jest.mock('@/services/backend-client/gitBranchesApi', () => ({
  fetchGitBranches: (...args: unknown[]) => mockFetchGitBranches(...args),
}));

jest.mock('@/store/GitOauthConfig', () => ({
  ...jest.requireActual('@/store/GitOauthConfig'),
  gitOauthConfigActionCreators: {
    requestGitOauthConfig: () => async () => undefined,
  },
}));
jest.mock('@/store/PersonalAccessTokens', () => ({
  ...jest.requireActual('@/store/PersonalAccessTokens'),
  personalAccessTokenActionCreators: {
    requestTokens: () => async () => undefined,
  },
}));

const mockOnChange = jest.fn();

describe('RepoOptionsAccordion', () => {
  let store: Store;

  beforeEach(() => {
    mockFetchGitBranches.mockResolvedValue({ branches: [] } as unknown as api.IGitBranches);
    store = new MockStoreBuilder()
      .withSshKeys({
        keys: [{ name: 'key1', keyPub: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD' }],
      })
      .build();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('snapshot with default values', () => {
    const snapshot = createSnapshot(store, 'testlocation');
    expect(snapshot.toJSON()).toMatchSnapshot();
  });

  test('update Advanced Options', async () => {
    renderComponent(store, 'https://testlocation');

    let updateAdvancedOptions = screen.queryByRole('button', {
      name: 'Advanced Options Change',
    });

    expect(updateAdvancedOptions).toBeNull();

    const accordionItemAdvancedOptions = screen.getByTestId('accordion-item-advanced-options');

    await userEvent.click(accordionItemAdvancedOptions);

    const advancedOptions = screen.queryByTestId('advanced-options');

    expect(advancedOptions).not.toBeNull();
    expect(advancedOptions).toHaveTextContent(
      'undefined, undefined, undefined, undefined, undefined',
    );

    updateAdvancedOptions = screen.queryByRole('button', {
      name: 'Advanced Options Change',
    });

    expect(updateAdvancedOptions).not.toBeNull();

    await userEvent.click(updateAdvancedOptions as HTMLElement);

    expect(mockOnChange).toHaveBeenCalledWith(
      'https://testlocation?image=newContainerImage&storageType=ephemeral&new&memoryLimit=1Gi&cpuLimit=1',
      undefined,
      undefined,
    );
  });

  test('update Git Repo Options without a supported git service', async () => {
    renderComponent(store, 'https://testlocation');

    let updateGitRepoOptions = screen.queryByRole('button', {
      name: 'Git Repo Options Change',
    });

    expect(updateGitRepoOptions).toBeNull();

    const accordionItemGitRepoOptions = screen.getByTestId('accordion-item-git-repo-options');

    await userEvent.click(accordionItemGitRepoOptions);

    const gitRepoOptions = screen.queryByTestId('git-repo-options');

    expect(gitRepoOptions).not.toBeNull();
    expect(gitRepoOptions).toHaveTextContent('undefined, [], undefined, false');

    updateGitRepoOptions = screen.queryByRole('button', {
      name: 'Git Repo Options Change',
    });

    expect(updateGitRepoOptions).not.toBeNull();

    await userEvent.click(updateGitRepoOptions as HTMLElement);

    expect(mockOnChange).toHaveBeenCalledWith(
      'https://testlocation?remotes={{test-updated,http://test}}&devfilePath=newDevfilePath',
      'success',
      'newBranch',
    );
  });

  test('update Git Repo Options wit a supported git service', async () => {
    renderComponent(store, 'https://github.com/testlocation');

    let updateGitRepoOptions = screen.queryByRole('button', {
      name: 'Git Repo Options Change',
    });

    expect(updateGitRepoOptions).toBeNull();

    const accordionItemGitRepoOptions = screen.getByTestId('accordion-item-git-repo-options');

    await userEvent.click(accordionItemGitRepoOptions);

    const gitRepoOptions = screen.queryByTestId('git-repo-options');

    expect(gitRepoOptions).not.toBeNull();
    expect(gitRepoOptions).toHaveTextContent('undefined, [], undefined, true');

    updateGitRepoOptions = screen.queryByRole('button', {
      name: 'Git Repo Options Change',
    });

    expect(updateGitRepoOptions).not.toBeNull();

    await userEvent.click(updateGitRepoOptions as HTMLElement);

    expect(mockOnChange).toHaveBeenCalledWith(
      'https://github.com/testlocation/undefined/tree/newBranch?remotes={{test-updated,http://test}}&devfilePath=newDevfilePath',
      'success',
      'newBranch',
    );
  });

  test('update Git Repo Options with a self-hosted git service configured by endpoint', async () => {
    store = new MockStoreBuilder()
      .withSshKeys({
        keys: [{ name: 'key1', keyPub: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD' }],
      })
      .withGitOauthConfig([{ name: 'gitlab', endpointUrl: 'https://git.example.internal' }], [], [])
      .build();

    renderComponent(store, 'https://git.example.internal/group/project');

    await userEvent.click(screen.getByTestId('accordion-item-git-repo-options'));

    expect(screen.queryByTestId('git-repo-options')).toHaveTextContent(
      'undefined, [], undefined, true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Git Repo Options Change' }));

    expect(mockOnChange).toHaveBeenCalledWith(
      'https://git.example.internal/group/project/-/tree/newBranch?remotes={{test-updated,http://test}}&devfilePath=newDevfilePath',
      'success',
      'newBranch',
    );
  });

  test('re-detect the git service when endpoints are loaded after mount', async () => {
    const location = 'https://git.example.internal/group/project';
    // endpoints are not loaded yet
    const { reRenderComponent } = renderComponent(store, location);

    await userEvent.click(screen.getByTestId('accordion-item-git-repo-options'));
    expect(screen.queryByTestId('git-repo-options')).toHaveTextContent(
      'undefined, [], undefined, false',
    );

    // endpoints are received
    const nextStore = new MockStoreBuilder()
      .withSshKeys({
        keys: [{ name: 'key1', keyPub: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD' }],
      })
      .withGitOauthConfig([{ name: 'gitlab', endpointUrl: 'https://git.example.internal' }], [], [])
      .build();
    reRenderComponent(nextStore, location);

    await waitFor(() =>
      expect(screen.queryByTestId('git-repo-options')).toHaveTextContent(
        'undefined, [], undefined, true',
      ),
    );
  });

  test('ignore a stale git branches response', async () => {
    const location = 'https://git.example.internal/group/project';
    let resolveFirstRequest: (value: api.IGitBranches) => void = () => undefined;
    mockFetchGitBranches.mockReturnValueOnce(
      new Promise<api.IGitBranches>(resolve => (resolveFirstRequest = resolve)),
    );
    // endpoints are not loaded yet, the first request is pending
    const { reRenderComponent } = renderComponent(store, location);
    await userEvent.click(screen.getByTestId('accordion-item-git-repo-options'));

    // endpoints are received, the second request resolves
    const nextStore = new MockStoreBuilder()
      .withSshKeys({
        keys: [{ name: 'key1', keyPub: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD' }],
      })
      .withGitOauthConfig([{ name: 'gitlab', endpointUrl: 'https://git.example.internal' }], [], [])
      .build();
    reRenderComponent(nextStore, location);

    await waitFor(() =>
      expect(screen.queryByTestId('git-repo-options')).toHaveTextContent(
        'undefined, [], undefined, true',
      ),
    );
    expect(mockFetchGitBranches).toHaveBeenCalledTimes(2);

    // the first (stale) request resolves last
    await act(async () => {
      resolveFirstRequest({ branches: ['main'] } as api.IGitBranches);
    });

    expect(screen.queryByTestId('git-repo-options')).toHaveTextContent(
      'undefined, [], undefined, true',
    );
  });

  test('do not re-fetch git branches when the detected git service is unchanged', async () => {
    const location = 'https://git.example.internal/group/project';
    const buildStore = (gitOauth: { name: api.GitOauthProvider; endpointUrl: string }[]) =>
      new MockStoreBuilder()
        .withSshKeys({
          keys: [{ name: 'key1', keyPub: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD' }],
        })
        .withGitOauthConfig(gitOauth, [], [])
        .build();

    const { reRenderComponent } = renderComponent(
      buildStore([{ name: 'gitlab', endpointUrl: 'https://git.example.internal' }]),
      location,
    );
    await waitFor(() => expect(mockFetchGitBranches).toHaveBeenCalledTimes(1));

    // same endpoints, new references
    reRenderComponent(
      buildStore([{ name: 'gitlab', endpointUrl: 'https://git.example.internal' }]),
      location,
    );
    // another endpoint, which does not affect the current location
    reRenderComponent(
      buildStore([
        { name: 'gitlab', endpointUrl: 'https://git.example.internal' },
        { name: 'github', endpointUrl: 'https://github.example.internal' },
      ]),
      location,
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockFetchGitBranches).toHaveBeenCalledTimes(1);
  });

  test('handle a failed git branches request', async () => {
    mockFetchGitBranches.mockRejectedValueOnce(new Error('Failed to fetch branches'));

    renderComponent(store, 'https://github.com/testlocation');
    await userEvent.click(screen.getByTestId('accordion-item-git-repo-options'));

    await waitFor(() =>
      expect(screen.queryByTestId('git-repo-options')).toHaveTextContent(
        'undefined, [], undefined, true',
      ),
    );
  });
});

function getComponent(store: Store, location: string) {
  return (
    <Provider store={store}>
      <RepoOptionsAccordion location={location} onChange={mockOnChange} />
    </Provider>
  );
}
