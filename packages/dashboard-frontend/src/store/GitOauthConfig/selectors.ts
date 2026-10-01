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

import { createSelector } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';

import { buildProviderByHost } from '@/components/ImportFromGit/helpers';
import { RootState } from '@/store';

const selectState = (state: RootState) => state.gitOauthConfig;

export const selectIsLoading = createSelector(selectState, state => {
  return state.isLoading;
});

export const selectGitOauth = createSelector(selectState, state => {
  return state.gitOauth;
});

export const selectProvidersWithToken = createSelector(selectState, state => {
  return state.providersWithToken;
});

export const selectSkipOauthProviders = createSelector(selectState, state => {
  return state.skipOauthProviders;
});

/**
 * Host → provider endpoints (path prefix and provider) map built from the configured OAuth
 * endpoints and the user's PAT endpoints.
 *
 * Memoized on the endpoint lists only (not on the whole slices, e.g. loading flags), and returns
 * the previous map as long as its content (deeply compared) is unchanged, so consumers can compare by reference.
 */
export const selectGitProviderByHost = createSelector(
  (state: RootState) => state.gitOauthConfig.gitOauth,
  (state: RootState) => state.personalAccessToken.tokens,
  buildProviderByHost,
  {
    memoizeOptions: {
      resultEqualityCheck: isEqual,
    },
  },
);

export const selectError = createSelector(selectState, state => {
  return state.error;
});
