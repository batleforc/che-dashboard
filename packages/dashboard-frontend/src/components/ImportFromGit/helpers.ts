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

import common, { api } from '@eclipse-che/common';
import { ValidatedOptions } from '@patternfly/react-core';
import isEqual from 'lodash/isEqual';

import {
  getGitRemotes,
  GitRemote,
  gitRemotesToParam,
} from '@/components/WorkspaceProgress/CreatingSteps/Apply/Devfile/getGitRemotes';
import { buildFactoryLoaderPath } from '@/preload/main';
import { FactoryLocationAdapter } from '@/services/factory-location-adapter';
import { REVISION_ATTR } from '@/services/helpers/factoryFlow/buildFactoryParams';
import type { IGitOauth } from '@/store/GitOauthConfig';

const BR_NAME_REGEX = /^[0-9A-Za-z-./_]{1,256}$/;

export function validateBrName(name: string): ValidatedOptions {
  if (BR_NAME_REGEX.test(name)) {
    return ValidatedOptions.success;
  }
  return ValidatedOptions.error;
}

export function validateLocation(location: string, hasSshKeys: boolean): ValidatedOptions {
  location = location.trim();
  const isValidHttp = FactoryLocationAdapter.isHttpLocation(location);
  const isValidGitSsh = FactoryLocationAdapter.isSshLocation(location);
  if (isValidHttp) {
    return ValidatedOptions.success;
  }
  if (isValidGitSsh && hasSshKeys) {
    return ValidatedOptions.success;
  }
  return ValidatedOptions.error;
}

export const supportedProviders: api.GitProvider[] = [
  'github',
  'gitlab',
  'bitbucket-server',
  'azure-devops',
  'forgejo',
];

/**
 * Maps a Git server host (e.g. `git.example.com` or `git.example.com:8443`) to its provider.
 */
export type ProviderByHost = Map<string, api.GitProvider>;

function toSupportedProvider(
  name: api.GitOauthProvider | api.GitProvider,
): api.GitProvider | undefined {
  // `github_2`, `gitlab_2` are second instances of the same provider
  let provider = name.replace(/_2$/, '');
  // Bitbucket Cloud URLs are handled as Bitbucket Server ones
  if (provider === 'bitbucket') {
    provider = 'bitbucket-server';
  }
  return supportedProviders.find(p => p === provider);
}

function getHost(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).host;
  } catch (e) {
    return undefined;
  }
}

/**
 * Builds the host → provider table from the endpoints configured by the administrator (OAuth)
 * and the endpoints of the user's personal access tokens. OAuth endpoints take precedence.
 */
export function buildProviderByHost(
  gitOauth: IGitOauth[],
  tokens: api.PersonalAccessToken[],
): ProviderByHost {
  const providerByHost: ProviderByHost = new Map();
  const entries: [string, api.GitOauthProvider | api.GitProvider][] = [
    ...gitOauth.map(({ endpointUrl, name }): [string, api.GitOauthProvider] => [endpointUrl, name]),
    ...tokens.map(({ gitProviderEndpoint, gitProvider }): [string, api.GitProvider] => [
      gitProviderEndpoint,
      gitProvider,
    ]),
  ];
  for (const [endpoint, name] of entries) {
    const host = getHost(endpoint);
    const provider = toSupportedProvider(name);
    if (host && provider && !providerByHost.has(host)) {
      providerByHost.set(host, provider);
    }
  }
  return providerByHost;
}

export function getSupportedGitService(
  location: string,
  providerByHost?: ProviderByHost,
): api.GitProvider {
  const url = new URL(location);
  const provider =
    providerByHost?.get(url.host) ||
    supportedProviders.find(p => url.host.includes(p.split('-')[0]));
  if (!provider) {
    throw new Error(`Provider not supported: ${url.host}`);
  }
  return provider;
}

export function isSupportedGitService(location: string, providerByHost?: ProviderByHost): boolean {
  try {
    getSupportedGitService(location, providerByHost);
    return true;
  } catch (error) {
    return false;
  }
}

export function getRepositoryUrlFromLocation(
  location: string,
  providerByHost?: ProviderByHost,
): string {
  let repo: string = location;
  let indexOf: number = 0;
  let service: string = '';
  try {
    service = getSupportedGitService(location, providerByHost);
  } catch (error) {
    return repo;
  }
  switch (service) {
    case 'github':
      indexOf = location.indexOf('/tree');
      if (indexOf > 0) {
        repo = location.substring(0, indexOf);
      }
      break;
    case 'gitlab':
      indexOf = location.indexOf('/-/tree');
      if (indexOf > 0) {
        repo = location.substring(0, indexOf);
      }
      break;
    case 'bitbucket-server':
      repo = location.replace('users/', 'scm/~').replace('repos/', '');
      break;
    case 'azure-devops':
      indexOf = location.indexOf('?');
      if (indexOf > 0) {
        repo = location.substring(0, indexOf);
      }
      break;
    case 'forgejo':
      indexOf = location.indexOf('/src/');
      if (indexOf > 0) {
        repo = location.substring(0, indexOf);
      }
      break;
  }

  // Strip query parameters for all providers except azure-devops:
  // params like ?df=... are Che-specific and must not be forwarded to git ls-remote.
  if (service !== 'azure-devops') {
    indexOf = repo.indexOf('?');
    if (indexOf > 0) {
      repo = repo.substring(0, indexOf);
    }
  }

  return repo;
}

export function getBranchFromLocation(
  location: string,
  providerByHost?: ProviderByHost,
): string | undefined {
  let branch: string | undefined = undefined;
  const pathname = new URL(location).pathname.replace(/^\//, '').replace(/\/$/, '').split('/');

  const service = getSupportedGitService(location, providerByHost);
  switch (service) {
    case 'github':
      if (pathname[2] === 'tree') {
        branch = pathname.slice(3).join('/');
      }
      break;
    case 'gitlab':
      if (pathname[2] === '-' && pathname[3] === 'tree') {
        branch = pathname.slice(4).join('/');
      }
      break;
    case 'bitbucket-server':
      if (pathname[2] === 'src') {
        branch = pathname.slice(3).join('/');
      }
      break;
    case 'azure-devops':
      branch = getBranchFromAzureDevOpsLocation(location);
      break;
    case 'forgejo':
      if (pathname[2] === 'src' && pathname[3] === 'branch') {
        branch = pathname.slice(4).join('/');
      }
      break;
  }

  return branch;
}

/**
 * Returns git branch from the encoded Azure DevOps repo location.
 */
function getBranchFromAzureDevOpsLocation(location: string): string | undefined {
  const url = new URL(location);

  const _location = decodeURIComponent(`${url.origin}${url.pathname}`);
  const _url = new URL(_location);
  const _searchParams = new URLSearchParams(_url.search);

  const version = _searchParams.get('version') || '';
  if (!version || !version.startsWith('GB')) {
    return undefined;
  }

  return version.replace(/^GB/, '');
}

/**
 * Returns updated location which includes Azure DevOps repo location with an encoded version as a param.
 */
function setBranchToAzureDevOpsLocation(location: string, branch: string | undefined): string {
  const url = new URL(location);
  const searchParams = new URLSearchParams(url.search);
  const [pathname, search] = url.pathname.split('%3F');
  const _searchParams = new URLSearchParams(decodeURIComponent(search || ''));
  if (!branch) {
    _searchParams.delete('version');
  } else {
    _searchParams.set('version', `GB${branch}`);
  }
  const encodedParams =
    searchParamsToString(_searchParams).length === 0
      ? ''
      : encodeURIComponent(`?${searchParamsToString(_searchParams)}`);
  url.pathname =
    searchParamsToString(_searchParams).length === 0 ? pathname : `${pathname}${encodedParams}`;

  return searchParamsToString(searchParams).length === 0
    ? `${url.origin}${url.pathname}`
    : `${url.origin}${url.pathname}?${searchParamsToString(searchParams)}`;
}

export function setBranchToLocation(
  location: string,
  branch: string | undefined,
  providerByHost?: ProviderByHost,
): string {
  if (!FactoryLocationAdapter.isHttpLocation(location)) {
    return branch ? `${location}?${REVISION_ATTR}=${branch}` : location;
  }
  const url = new URL(location);
  const pathname = url.pathname.replace(/^\//, '').replace(/\/$/, '');

  const [user, project] = pathname.split('/');

  const service = getSupportedGitService(location, providerByHost);
  if (!branch) {
    if (service === 'azure-devops') {
      url.href = setBranchToAzureDevOpsLocation(location, branch);
    } else {
      url.pathname = `${user}/${project}`;
    }
  } else {
    switch (service) {
      case 'github':
        url.pathname = `${user}/${project}/tree/${branch}`;
        break;
      case 'gitlab':
        url.pathname = `${pathname.replace(/\/-\/tree\/.*$/, '')}/-/tree/${branch}`;
        break;
      case 'bitbucket-server':
        url.pathname = `${user}/${project}/src/${branch}`;
        break;
      case 'azure-devops':
        url.href = setBranchToAzureDevOpsLocation(location, branch);
        break;
      case 'forgejo':
        url.pathname = `${user}/${project}/src/branch/${branch}`;
        break;
    }
  }

  return `${url.origin}${url.pathname}${decodeURIComponent(url.search)}`;
}

function getFactoryParamsFromLocation(
  location: string,
  ignoreBranch?: boolean,
  providerByHost?: ProviderByHost,
): {
  path: string;
  searchParams: URLSearchParams;
} {
  if (
    !ignoreBranch &&
    isSupportedGitService(location, providerByHost) &&
    getSupportedGitService(location, providerByHost) === 'azure-devops'
  ) {
    const url = new URL(location);
    const searchParams = new URLSearchParams(url.search);
    const path = searchParams.get('path');
    const version = searchParams.get('version');
    const repoSearchParams = new URLSearchParams();
    if (path) {
      searchParams.delete('path');
      if (path !== 'true') {
        repoSearchParams.set('path', path);
      }
    }
    if (version) {
      searchParams.delete('version');
      if (version !== 'true') {
        repoSearchParams.set('version', version);
      }
    }
    if (searchParamsToString(repoSearchParams).length > 0) {
      const encodedParams = encodeURIComponent(`?${searchParamsToString(repoSearchParams)}`);
      location = `${url.origin}${url.pathname}${encodedParams}?${searchParamsToString(searchParams)}`;
    }
  }

  const factory = new FactoryLocationAdapter(location);
  const { path } = factory;
  const factoryStr = factory.toString();
  const factoryLoaderPath = buildFactoryLoaderPath(factoryStr, true);
  const params = factoryLoaderPath.split('?')[1] || '';
  const searchParams = new URLSearchParams(params);
  // merge searchParams from the url param
  new URLSearchParams(
    decodeURIComponent(decodeURIComponent(searchParams.get('url') || '').split('%3F')[1] || ''),
  ).forEach((val, key) => {
    searchParams.set(key, val);
  });
  searchParams.delete('url');

  // from policies.create to new
  if (searchParams.has('policies.create')) {
    if (searchParams.get('policies.create') === 'perclick') {
      searchParams.set('new', '');
    }
    searchParams.delete('policies.create');
  }

  // from override.devfileFilename to devfilePath
  if (searchParams.has('override.devfileFilename')) {
    const devfilePath = searchParams.get('override.devfileFilename');
    if (devfilePath !== 'true' && devfilePath) {
      searchParams.set('devfilePath', devfilePath);
    }
    searchParams.delete('override.devfileFilename');
  }

  return { path, searchParams };
}

export function getGitRepoOptionsFromLocation(
  location: string,
  providerByHost?: ProviderByHost,
): {
  location: string | undefined;
  gitBranch: string | undefined;
  remotes: GitRemote[] | undefined;
  devfilePath: string | undefined;
  hasSupportedGitService: boolean;
} {
  const { path, searchParams } = getFactoryParamsFromLocation(location, false, providerByHost);
  const devfilePath = searchParams.get('devfilePath') || undefined;
  let remotes: GitRemote[] | undefined;
  const _remotes = searchParams.get('remotes') || undefined;
  if (_remotes === 'true' || _remotes === '{}') {
    searchParams.delete('remotes');
    remotes = undefined;
  } else {
    try {
      remotes = getGitRemotes(_remotes);
    } catch (e) {
      console.log(common.helpers.errors.getMessage(e));
    }
  }
  location =
    searchParamsToString(searchParams).length === 0
      ? `${path}`
      : `${path}?${searchParamsToString(searchParams)}`;
  const hasSupportedGitService = isSupportedGitService(location, providerByHost);
  let gitBranch: string | undefined = undefined;
  if (hasSupportedGitService) {
    try {
      gitBranch = getBranchFromLocation(location, providerByHost);
    } catch (e) {
      console.log(`Unable to get branch from '${location}'.${common.helpers.errors.getMessage(e)}`);
    }
  } else if (!FactoryLocationAdapter.isHttpLocation(location)) {
    gitBranch = searchParams.get(REVISION_ATTR) || undefined;
  }
  return { location, gitBranch, remotes, devfilePath, hasSupportedGitService };
}

export function getAdvancedOptionsFromLocation(location: string): {
  location: string | undefined;
  containerImage: string | undefined;
  temporaryStorage: boolean | undefined;
  createNewIfExisting: boolean | undefined;
  memoryLimit: number | undefined;
  cpuLimit: number | undefined;
} {
  const { path, searchParams } = getFactoryParamsFromLocation(location, true);

  let containerImage = searchParams.get('image') || undefined;
  if (containerImage === '' || containerImage === 'true') {
    searchParams.delete('image');
    containerImage = undefined;
  }

  const _storageType = searchParams.get('storageType');
  let temporaryStorage: boolean | undefined =
    _storageType !== null ? _storageType === 'ephemeral' : undefined;
  if (_storageType === '' || _storageType === 'true') {
    searchParams.delete('storageType');
    temporaryStorage = undefined;
  }

  const createNewIfExisting = searchParams.has('new') || undefined;

  let _memoryLimit = searchParams.get('memoryLimit') || undefined;

  if (_memoryLimit === '' || _memoryLimit === 'true') {
    searchParams.delete('memoryLimit');
    _memoryLimit = undefined;
  }
  let memoryLimit = _memoryLimit ? getBytes(_memoryLimit) : undefined;

  if (memoryLimit && isNaN(memoryLimit)) {
    searchParams.delete('memoryLimit');
    memoryLimit = undefined;
  }

  let _cpuLimit = searchParams.get('cpuLimit') || undefined;
  if (_cpuLimit === 'true') {
    searchParams.delete('cpuLimit');
    _cpuLimit = undefined;
  }
  let cpuLimit = _cpuLimit ? parseInt(_cpuLimit) : undefined;
  if (cpuLimit && isNaN(cpuLimit)) {
    searchParams.delete('cpuLimit');
    cpuLimit = undefined;
  }

  location =
    searchParamsToString(searchParams).length === 0
      ? `${path}`
      : `${path}?${searchParamsToString(searchParams)}`;

  return {
    location,
    containerImage,
    temporaryStorage,
    createNewIfExisting,
    memoryLimit,
    cpuLimit,
  };
}

export function getRepoLocation(factoryLocation: string): string {
  return factoryLocation.split('?')[0];
}

export interface IGitRepoOptions {
  location?: string;
  gitBranch?: string | undefined;
  remotes?: GitRemote[] | undefined;
  devfilePath?: string | undefined;
}

export function setGitRepoOptionsToLocation(
  newOptions: IGitRepoOptions,
  currentOptions: IGitRepoOptions,
  providerByHost?: ProviderByHost,
): IGitRepoOptions {
  const state: IGitRepoOptions = {};
  let location = currentOptions.location;
  if (!location) {
    return newOptions;
  }
  const { path, searchParams } = getFactoryParamsFromLocation(location, false, providerByHost);

  if (!isEqual(newOptions.remotes, currentOptions.remotes)) {
    state.remotes = newOptions.remotes;
    // update the location with the new remotes values
    if (!newOptions.remotes || newOptions.remotes.length === 0) {
      searchParams.delete('remotes');
    } else {
      const remotesStr = gitRemotesToParam(newOptions.remotes);
      searchParams.set('remotes', remotesStr);
    }
  }

  if (newOptions.devfilePath !== currentOptions.devfilePath) {
    state.devfilePath = newOptions.devfilePath;
  }
  // update the location with the new devfilePath value
  if (searchParams.has('override.devfileFilename')) {
    searchParams.delete('override.devfileFilename');
  }
  if (searchParams.has('df')) {
    searchParams.delete('df');
  }
  if (newOptions.devfilePath) {
    searchParams.set('devfilePath', newOptions.devfilePath);
  } else {
    searchParams.delete('devfilePath');
  }

  if (newOptions.gitBranch !== currentOptions.gitBranch) {
    state.gitBranch = newOptions.gitBranch;
  }
  if (!FactoryLocationAdapter.isHttpLocation(location) && newOptions.gitBranch) {
    searchParams.set(REVISION_ATTR, newOptions.gitBranch);
  }
  // update the location with the new gitBranch value
  let searchParamsStr = decodeURIComponent(searchParamsToString(searchParams));
  const hasSearchParams = searchParamsStr.length > 0;
  if (hasSearchParams) {
    searchParamsStr = decodeURIComponent(searchParamsStr);
  }
  if (isSupportedGitService(location, providerByHost)) {
    location = setBranchToLocation(
      hasSearchParams ? `${path}?${searchParamsStr}` : `${path}`,
      newOptions.gitBranch,
      providerByHost,
    );
  } else {
    location = hasSearchParams ? `${path}?${searchParamsStr}` : `${path}`;
  }
  // update the location in the state
  state.location = location;

  return state;
}

export interface IAdvancedOptions {
  location?: string;
  containerImage?: string | undefined;
  temporaryStorage?: boolean | undefined;
  createNewIfExisting?: boolean | undefined;
  memoryLimit?: number | undefined;
  cpuLimit?: number | undefined;
}

export function setAdvancedOptionsToLocation(
  newOptions: IAdvancedOptions,
  currentOptions: IAdvancedOptions,
): IAdvancedOptions {
  const state: IAdvancedOptions = {};
  let location = currentOptions.location;
  if (!location) {
    return newOptions;
  }
  const { path, searchParams } = getFactoryParamsFromLocation(location, true);

  if (newOptions.containerImage !== currentOptions.containerImage) {
    state.containerImage = newOptions.containerImage;
    if (newOptions.containerImage) {
      searchParams.set('image', newOptions.containerImage);
    } else {
      searchParams.delete('image');
    }
  }

  if (newOptions.temporaryStorage !== currentOptions.temporaryStorage) {
    state.temporaryStorage = newOptions.temporaryStorage;
    if (newOptions.temporaryStorage) {
      searchParams.set('storageType', 'ephemeral');
    } else if (searchParams.get('storageType') === 'ephemeral') {
      searchParams.delete('storageType');
    }
  }

  if (newOptions.createNewIfExisting !== currentOptions.createNewIfExisting) {
    state.createNewIfExisting = newOptions.createNewIfExisting;
    if (newOptions.createNewIfExisting) {
      searchParams.set('new', '');
    } else {
      searchParams.delete('new');
    }
  }

  if (newOptions.memoryLimit !== currentOptions.memoryLimit) {
    state.memoryLimit = newOptions.memoryLimit;
    if (newOptions.memoryLimit) {
      const formattedMemoryLimit = formatBytes(newOptions.memoryLimit, 3, true);
      if (formattedMemoryLimit) {
        searchParams.set('memoryLimit', formattedMemoryLimit);
      } else {
        searchParams.delete('memoryLimit');
      }
    } else {
      searchParams.delete('memoryLimit');
    }
  }

  if (newOptions.cpuLimit !== currentOptions.cpuLimit) {
    state.cpuLimit = newOptions.cpuLimit;
    if (newOptions.cpuLimit) {
      searchParams.set('cpuLimit', newOptions.cpuLimit.toString());
    } else {
      searchParams.delete('cpuLimit');
    }
  }

  // update the location with the new gitBranch value
  location =
    searchParamsToString(searchParams).length > 0
      ? `${path}?${searchParamsToString(searchParams)}`
      : `${path}`;
  // update the location in the state
  state.location = location;

  return state;
}

const UNITS_OF_MEASUREMENT = ['', 'K', 'M', 'G', 'T', 'P'];

export function formatBytes(
  bytes: number | undefined,
  decimals = 2,
  binaryUnits = true,
): string | undefined {
  if (!bytes) {
    return undefined;
  }
  const k = binaryUnits ? 1024 : 1000;
  const unitsOfMeasurement = UNITS_OF_MEASUREMENT.map((unit, index) => {
    if (index > 0 && binaryUnits) {
      unit += 'i';
    }
    return unit;
  });
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + unitsOfMeasurement[i];
}

export function getBytes(value: string): number | undefined {
  value = value.trim();
  if (value === '') {
    return undefined;
  }
  const bytes = parseFloat(value);
  if (isNaN(bytes)) {
    return undefined;
  }
  const unitOfMeasurement = value.replace(bytes.toString(), '').trim().toLowerCase();
  if (!unitOfMeasurement) {
    return bytes;
  }
  const k = unitOfMeasurement.match(/ib?$/) !== null ? 1024 : 1000;
  const i = UNITS_OF_MEASUREMENT.map(unit => unit.toLowerCase()).indexOf(unitOfMeasurement[0]);
  if (i === -1) {
    return undefined;
  }
  return bytes * Math.pow(k, i);
}

export function searchParamsToString(params: URLSearchParams): string {
  return params.toString().replace(/=&/g, '&').replace(/=$/, '');
}
