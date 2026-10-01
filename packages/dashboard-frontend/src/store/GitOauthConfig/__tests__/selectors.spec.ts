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

import { RootState } from '@/store';
import {
  selectError,
  selectGitOauth,
  selectGitProviderByHost,
  selectIsLoading,
  selectProvidersWithToken,
  selectSkipOauthProviders,
} from '@/store/GitOauthConfig/selectors';

describe('GitOauthConfig, selectors', () => {
  const mockState = {
    gitOauthConfig: {
      isLoading: true,
      gitOauth: [{ name: 'github', endpointUrl: 'https://github.com' }],
      providersWithToken: ['github'],
      skipOauthProviders: ['gitlab'],
      error: 'Something went wrong',
    },
    personalAccessToken: {
      isLoading: false,
      tokens: [
        {
          gitProvider: 'gitlab',
          gitProviderEndpoint: 'https://git.example.internal',
        },
      ],
      error: undefined,
    },
  } as RootState;

  it('should select isLoading', () => {
    const result = selectIsLoading(mockState);
    expect(result).toBe(true);
  });

  it('should select gitOauth', () => {
    const result = selectGitOauth(mockState);
    expect(result).toEqual([{ name: 'github', endpointUrl: 'https://github.com' }]);
  });

  it('should select providersWithToken', () => {
    const result = selectProvidersWithToken(mockState);
    expect(result).toEqual(['github']);
  });

  it('should select skipOauthProviders', () => {
    const result = selectSkipOauthProviders(mockState);
    expect(result).toEqual(['gitlab']);
  });

  it('should select git provider by host', () => {
    const result = selectGitProviderByHost(mockState);
    expect(Object.fromEntries(result)).toEqual({
      'github.com': [{ pathPrefix: '', provider: 'github' }],
      'git.example.internal': [{ pathPrefix: '', provider: 'gitlab' }],
    });
  });

  it('should not rebuild the git provider by host map when only loading flags change', () => {
    const result = selectGitProviderByHost(mockState);
    const nextState = {
      ...mockState,
      gitOauthConfig: { ...mockState.gitOauthConfig, isLoading: false },
      personalAccessToken: { ...mockState.personalAccessToken, isLoading: true },
    } as RootState;
    expect(selectGitProviderByHost(nextState)).toBe(result);
  });

  it('should return the same git provider by host map when its content is unchanged', () => {
    const result = selectGitProviderByHost(mockState);
    const nextState = {
      ...mockState,
      personalAccessToken: {
        ...mockState.personalAccessToken,
        tokens: [...mockState.personalAccessToken.tokens],
      },
    } as RootState;
    expect(selectGitProviderByHost(nextState)).toBe(result);
  });

  it('should return a new git provider by host map when its content changes', () => {
    const result = selectGitProviderByHost(mockState);
    const nextState = {
      ...mockState,
      personalAccessToken: {
        ...mockState.personalAccessToken,
        tokens: [
          {
            gitProvider: 'forgejo',
            gitProviderEndpoint: 'https://forgejo.example.internal',
          },
        ],
      },
    } as RootState;
    const nextResult = selectGitProviderByHost(nextState);
    expect(nextResult).not.toBe(result);
    expect(Object.fromEntries(nextResult)).toEqual({
      'github.com': [{ pathPrefix: '', provider: 'github' }],
      'forgejo.example.internal': [{ pathPrefix: '', provider: 'forgejo' }],
    });
  });

  it('should select error', () => {
    const result = selectError(mockState);
    expect(result).toEqual('Something went wrong');
  });
});
