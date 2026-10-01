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

export const GIT_OAUTH_PROVIDERS: Record<api.GitOauthProvider, string> = {
  'azure-devops': 'Microsoft Azure DevOps',
  // Either Bitbucket Cloud or Bitbucket Server
  // https://github.com/eclipse-che/che-server/blob/main/wsmaster/che-core-api-auth-bitbucket/src/main/java/org/eclipse/che/security/oauth/BitbucketOAuthAuthenticator.java
  'bitbucket-server': 'Bitbucket',
  // Bitbucket Server only
  // https://github.com/eclipse-che/che-server/blob/main/wsmaster/che-core-api-auth-bitbucket/src/main/java/org/eclipse/che/security/oauth1/BitbucketServerOAuthAuthenticator.java
  bitbucket: 'Bitbucket',
  github: 'GitHub',
  github_2: 'GitHub (The second provider)',
  gitlab: 'GitLab',
  gitlab_2: 'GitLab (The second provider)',
  // Also covers Gitea, which exposes the same API
  forgejo: 'Forgejo',
  forgejo_2: 'Forgejo (The second provider)',
} as const;

export const DEFAULT_GIT_OAUTH_PROVIDER: api.GitOauthProvider = 'github';

export const GIT_PROVIDERS: Record<api.GitProvider, string> = {
  'azure-devops': 'Microsoft Azure DevOps',
  'bitbucket-server': 'Bitbucket Server',
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  forgejo: 'Forgejo',
} as const;

export const DEFAULT_GIT_PROVIDER: api.GitProvider = 'github';

export const GIT_PROVIDER_ENDPOINTS: Record<api.GitProvider, string> = {
  'azure-devops': 'https://dev.azure.com',
  'bitbucket-server': 'https://bitbucket.org',
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
  bitbucket: 'https://bitbucket.org/',
  // Forgejo is mostly self-hosted (e.g. https://codeberg.org): no default, the endpoint is required
  forgejo: '',
} as const;
