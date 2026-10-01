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

import { buildProviderByHost } from '@/components/ImportFromGit/helpers';
import { RootState } from '@/store';
import { selectPersonalAccessTokens } from '@/store/PersonalAccessTokens/selectors';

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
 * Host → provider map built from the configured OAuth endpoints and the user's PAT endpoints.
 */
export const selectGitProviderByHost = createSelector(
  selectGitOauth,
  selectPersonalAccessTokens,
  buildProviderByHost,
);

export const selectError = createSelector(selectState, state => {
  return state.error;
});
