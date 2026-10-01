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

import * as helpers from '@/components/ImportFromGit/helpers';
import { formatBytes, getBytes } from '@/components/ImportFromGit/helpers';
import { IGitOauth } from '@/store/GitOauthConfig';

describe('helpers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('getRepoLocation', () => {
    test('with parameters', () => {
      const location = helpers.getRepoLocation('https://dummy-repo.git?policies.create=perclick');

      expect(location).toEqual('https://dummy-repo.git');
    });

    test('without parameters', () => {
      const location = helpers.getRepoLocation('https://dummy-repo.git');

      expect(location).toEqual('https://dummy-repo.git');
    });
  });

  describe('validateLocation', () => {
    describe('has SSH key', () => {
      const hasSshKey = true;
      test('valid', () => {
        expect(helpers.validateLocation('http://test-location', hasSshKey)).toBe(
          ValidatedOptions.success,
        );
        expect(helpers.validateLocation('git@github.com:test/test.git', hasSshKey)).toBe(
          ValidatedOptions.success,
        );
      });
      test('invalid', () => {
        expect(helpers.validateLocation('', hasSshKey)).toBe(ValidatedOptions.error);
        expect(helpers.validateLocation('http://', hasSshKey)).toBe(ValidatedOptions.error);
        expect(helpers.validateLocation('git@github.com', hasSshKey)).toBe(ValidatedOptions.error);
      });
    });
    describe('without SSH key', () => {
      const hasSshKey = false;
      test('valid', () => {
        expect(helpers.validateLocation('http://test-location', hasSshKey)).toBe(
          ValidatedOptions.success,
        );
      });
      test('invalid', () => {
        expect(helpers.validateLocation('', hasSshKey)).toBe(ValidatedOptions.error);
        expect(helpers.validateLocation('http://', hasSshKey)).toBe(ValidatedOptions.error);
        expect(helpers.validateLocation('git@github.com', hasSshKey)).toBe(ValidatedOptions.error);
        expect(helpers.validateLocation('git@github.com:test/test.git', hasSshKey)).toBe(
          ValidatedOptions.error,
        );
      });
    });
  });

  describe('supportedProviders', () => {
    test('should includes "github", "gitlab" and "bitbucket"', () => {
      expect(helpers.supportedProviders).toEqual([
        'github',
        'gitlab',
        'bitbucket-server',
        'azure-devops',
        'forgejo',
      ]);
    });
  });

  describe('getSupportedGitService', () => {
    test('should return provider', () => {
      expect(helpers.getSupportedGitService('https://github.com')).toBe('github');
      expect(helpers.getSupportedGitService('https://gitlab.com')).toBe('gitlab');
      expect(helpers.getSupportedGitService('https://bitbucket.org')).toBe('bitbucket-server');
      expect(helpers.getSupportedGitService('https://dev.azure.com')).toBe('azure-devops');
    });

    test('should throw error when provider is not supported', () => {
      expect(() => helpers.getSupportedGitService('https://not-supported.com')).toThrow(
        'Provider not supported: not-supported.com',
      );
    });
  });

  describe('isSupportedGitService', () => {
    test('should return true when provider is supported', () => {
      expect(helpers.isSupportedGitService('https://github.com')).toBe(true);
      expect(helpers.isSupportedGitService('https://gitlab.com')).toBe(true);
      expect(helpers.isSupportedGitService('https://bitbucket.org')).toBe(true);
      expect(helpers.isSupportedGitService('https://dev.azure.com')).toBe(true);
    });

    test('should return false when provider is not supported', () => {
      expect(helpers.isSupportedGitService('https://not-supported.com')).toBe(false);
    });
  });

  describe('endpoint-based provider detection', () => {
    const gitOauth: IGitOauth[] = [
      { name: 'gitlab', endpointUrl: 'https://git.example.internal' },
      { name: 'github_2', endpointUrl: 'https://github.example.com/' },
      { name: 'gitlab_2', endpointUrl: 'https://github.example.org' },
      { name: 'bitbucket', endpointUrl: 'https://scm.example.org:8443' },
      { name: 'github', endpointUrl: 'not-a-url' },
    ];
    const tokens = [
      {
        gitProvider: 'github',
        gitProviderEndpoint: 'https://git.example.internal',
      },
      {
        gitProvider: 'azure-devops',
        gitProviderEndpoint: 'https://ado.example.net',
        gitProviderOrganization: 'org',
      },
    ] as api.PersonalAccessToken[];

    let providerByHost: helpers.ProviderByHost;

    beforeEach(() => {
      providerByHost = helpers.buildProviderByHost(gitOauth, tokens);
    });

    test('buildProviderByHost', () => {
      expect(Object.fromEntries(providerByHost)).toEqual({
        // OAuth endpoint wins over the PAT one
        'git.example.internal': [{ pathPrefix: '', provider: 'gitlab' }],
        'github.example.com': [{ pathPrefix: '', provider: 'github' }],
        'github.example.org': [{ pathPrefix: '', provider: 'gitlab' }],
        'scm.example.org:8443': [{ pathPrefix: '', provider: 'bitbucket-server' }],
        'ado.example.net': [{ pathPrefix: '', provider: 'azure-devops' }],
      });
    });

    test('buildProviderByHost with no configuration', () => {
      expect(helpers.buildProviderByHost([], []).size).toBe(0);
    });

    test('configured self-hosted GitLab is detected as "gitlab"', () => {
      const location = 'https://git.example.internal/group/project/-/tree/feature/x';
      expect(helpers.getSupportedGitService(location, providerByHost)).toBe('gitlab');
      expect(helpers.isSupportedGitService(location, providerByHost)).toBe(true);
      expect(helpers.getBranchFromLocation(location, providerByHost)).toBe('feature/x');
      expect(helpers.getRepositoryUrlFromLocation(location, providerByHost)).toBe(
        'https://git.example.internal/group/project',
      );
      expect(
        helpers.setBranchToLocation(
          'https://git.example.internal/group/project',
          'main',
          providerByHost,
        ),
      ).toBe('https://git.example.internal/group/project/-/tree/main');
    });

    test('host matched by both the table and the heuristic: table wins', () => {
      const location = 'https://github.example.org/group/project/-/tree/main';
      expect(helpers.getSupportedGitService(location)).toBe('github');
      expect(helpers.getSupportedGitService(location, providerByHost)).toBe('gitlab');
      expect(helpers.getBranchFromLocation(location, providerByHost)).toBe('main');
    });

    test('host with port is matched', () => {
      expect(
        helpers.getSupportedGitService('https://scm.example.org:8443/a/b', providerByHost),
      ).toBe('bitbucket-server');
      expect(() =>
        helpers.getSupportedGitService('https://scm.example.org/a/b', providerByHost),
      ).toThrow('Provider not supported: scm.example.org');
    });

    test('unknown host falls back to the heuristic', () => {
      expect(helpers.getSupportedGitService('https://github.com/a/b', providerByHost)).toBe(
        'github',
      );
      expect(() =>
        helpers.getSupportedGitService('https://not-supported.com', providerByHost),
      ).toThrow('Provider not supported: not-supported.com');
    });

    test('unknown host without configuration: unchanged behaviour', () => {
      expect(() =>
        helpers.getSupportedGitService('https://git.example.internal/a/b', new Map()),
      ).toThrow('Provider not supported: git.example.internal');
      expect(helpers.isSupportedGitService('https://git.example.internal/a/b')).toBe(false);
    });

    test('getGitRepoOptionsFromLocation', () => {
      const options = helpers.getGitRepoOptionsFromLocation(
        'https://git.example.internal/group/project/-/tree/dev?devfilePath=devfile2.yaml',
        providerByHost,
      );
      expect(options.hasSupportedGitService).toBe(true);
      expect(options.gitBranch).toBe('dev');
      expect(options.devfilePath).toBe('devfile2.yaml');
    });

    test('setGitRepoOptionsToLocation', () => {
      const options = helpers.setGitRepoOptionsToLocation(
        { gitBranch: 'dev', remotes: undefined, devfilePath: undefined },
        {
          location: 'https://git.example.internal/group/project',
          gitBranch: undefined,
          remotes: undefined,
          devfilePath: undefined,
        },
        providerByHost,
      );
      expect(options.location).toBe('https://git.example.internal/group/project/-/tree/dev');
    });
  });

  describe('forgejo', () => {
    // Codeberg is a Forgejo instance whose host does not contain "forgejo"
    const providerByHost = helpers.buildProviderByHost(
      [{ name: 'forgejo_2', endpointUrl: 'https://codeberg.org' }],
      [],
    );

    test('detection by host name', () => {
      expect(helpers.getSupportedGitService('https://forgejo.example.com/owner/repo')).toBe(
        'forgejo',
      );
      expect(helpers.isSupportedGitService('https://codeberg.org/owner/repo')).toBe(false);
    });

    test('detection by configured endpoint', () => {
      expect(
        helpers.getSupportedGitService('https://codeberg.org/owner/repo', providerByHost),
      ).toBe('forgejo');
    });

    test('detection by personal access token endpoint', () => {
      const byToken = helpers.buildProviderByHost(
        [],
        [
          {
            gitProvider: 'forgejo',
            gitProviderEndpoint: 'https://git.example.com:3000',
          } as api.PersonalAccessToken,
        ],
      );
      expect(
        helpers.getSupportedGitService('https://git.example.com:3000/owner/repo', byToken),
      ).toBe('forgejo');
    });

    test('getRepositoryUrlFromLocation', () => {
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://codeberg.org/owner/repo/src/branch/main',
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/repo');
      expect(
        helpers.getRepositoryUrlFromLocation('https://codeberg.org/owner/repo', providerByHost),
      ).toBe('https://codeberg.org/owner/repo');
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://forgejo.example.com/owner/repo/src/branch/main?devfilePath=devfile.yaml',
        ),
      ).toBe('https://forgejo.example.com/owner/repo');
    });

    test('getRepositoryUrlFromLocation with "src" as an owner or repository name', () => {
      // owner named "src"
      expect(
        helpers.getRepositoryUrlFromLocation('https://codeberg.org/src/repo', providerByHost),
      ).toBe('https://codeberg.org/src/repo');
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://codeberg.org/src/repo/src/branch/main',
          providerByHost,
        ),
      ).toBe('https://codeberg.org/src/repo');
      // repository named "src"
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://codeberg.org/owner/src/src/branch/main',
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/src');
      expect(
        helpers.getRepositoryUrlFromLocation('https://codeberg.org/owner/src/', providerByHost),
      ).toBe('https://codeberg.org/owner/src');
    });

    test('getRepositoryUrlFromLocation with tag, commit, trailing slash and .git suffix', () => {
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://codeberg.org/owner/repo/src/tag/v1.0.0',
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/repo');
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://codeberg.org/owner/repo/src/commit/0123456789abcdef',
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/repo');
      expect(
        helpers.getRepositoryUrlFromLocation('https://codeberg.org/owner/repo/', providerByHost),
      ).toBe('https://codeberg.org/owner/repo');
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://codeberg.org/owner/repo.git?devfilePath=devfile.yaml',
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/repo.git');
    });

    test('getBranchFromLocation', () => {
      expect(
        helpers.getBranchFromLocation('https://codeberg.org/owner/repo', providerByHost),
      ).toBeUndefined();
      expect(
        helpers.getBranchFromLocation(
          'https://codeberg.org/owner/repo/src/branch/feature/new-ui',
          providerByHost,
        ),
      ).toBe('feature/new-ui');
      expect(
        helpers.getBranchFromLocation(
          'https://codeberg.org/owner/repo/src/tag/v1.0.0',
          providerByHost,
        ),
      ).toBeUndefined();
    });

    test('setBranchToLocation', () => {
      expect(
        helpers.setBranchToLocation('https://codeberg.org/owner/repo', 'dev', providerByHost),
      ).toBe('https://codeberg.org/owner/repo/src/branch/dev');
      expect(
        helpers.setBranchToLocation(
          'https://codeberg.org/owner/repo/src/branch/dev',
          undefined,
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/repo');
    });

    test('setBranchToLocation keeps tag and commit references when no branch is set', () => {
      expect(
        helpers.setBranchToLocation(
          'https://codeberg.org/owner/repo/src/tag/v1.0.0',
          undefined,
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/repo/src/tag/v1.0.0');
      expect(
        helpers.setBranchToLocation(
          'https://codeberg.org/owner/repo/src/commit/0123456789abcdef/',
          undefined,
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/repo/src/commit/0123456789abcdef');
      // an explicitly chosen branch replaces the tag reference
      expect(
        helpers.setBranchToLocation(
          'https://codeberg.org/owner/repo/src/tag/v1.0.0',
          'dev',
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/repo/src/branch/dev');
      // incomplete reference
      expect(
        helpers.setBranchToLocation(
          'https://codeberg.org/owner/repo/src/tag',
          undefined,
          providerByHost,
        ),
      ).toBe('https://codeberg.org/owner/repo');
    });

    test('getBranchFromLocation returns no branch for a commit', () => {
      expect(
        helpers.getBranchFromLocation(
          'https://codeberg.org/owner/repo/src/commit/0123456789abcdef',
          providerByHost,
        ),
      ).toBeUndefined();
    });

    test('setGitRepoOptionsToLocation keeps the tag reference', () => {
      const location = 'https://codeberg.org/owner/repo/src/tag/v1.0.0';
      const options = helpers.setGitRepoOptionsToLocation(
        { gitBranch: undefined, remotes: undefined, devfilePath: 'devfile.yaml' },
        { location, gitBranch: undefined, remotes: undefined, devfilePath: undefined },
        providerByHost,
      );
      expect(options.location).toBe(
        'https://codeberg.org/owner/repo/src/tag/v1.0.0?devfilePath=devfile.yaml',
      );
    });

    test('getGitRepoOptionsFromLocation', () => {
      const options = helpers.getGitRepoOptionsFromLocation(
        'https://codeberg.org/owner/repo/src/branch/dev?devfilePath=.devfile.yaml',
        providerByHost,
      );
      expect(options.hasSupportedGitService).toBe(true);
      expect(options.gitBranch).toBe('dev');
      expect(options.devfilePath).toBe('.devfile.yaml');
    });
  });

  describe('subpath endpoints', () => {
    const providerByHost = helpers.buildProviderByHost(
      [
        { name: 'forgejo', endpointUrl: 'https://Example.com/forgejo/' },
        { name: 'gitlab', endpointUrl: 'https://example.com/forgejo/gitlab' },
        { name: 'github', endpointUrl: 'https://github.example.com' },
      ],
      [
        {
          gitProvider: 'bitbucket-server',
          gitProviderEndpoint: 'https://example.com/bitbucket//',
        } as api.PersonalAccessToken,
      ],
    );

    test('buildProviderByHost keeps the path prefix, longest first', () => {
      expect(Object.fromEntries(providerByHost)).toEqual({
        'example.com': [
          { pathPrefix: '/forgejo/gitlab', provider: 'gitlab' },
          { pathPrefix: '/bitbucket', provider: 'bitbucket-server' },
          { pathPrefix: '/forgejo', provider: 'forgejo' },
        ],
        'github.example.com': [{ pathPrefix: '', provider: 'github' }],
      });
    });

    test('detection inside the path prefix', () => {
      expect(
        helpers.getSupportedGitService('https://example.com/forgejo/o/r', providerByHost),
      ).toBe('forgejo');
      expect(helpers.getSupportedGitService('https://EXAMPLE.com/forgejo', providerByHost)).toBe(
        'forgejo',
      );
      expect(
        helpers.detectGitService('https://example.com/forgejo/gitlab/g/p', providerByHost),
      ).toEqual({ pathPrefix: '/forgejo/gitlab', provider: 'gitlab' });
      expect(helpers.detectGitService('https://example.com/bitbucket/a/b', providerByHost)).toEqual(
        { pathPrefix: '/bitbucket', provider: 'bitbucket-server' },
      );
    });

    test('no detection outside the path prefix', () => {
      expect(helpers.isSupportedGitService('https://example.com/o/r', providerByHost)).toBe(false);
      expect(
        helpers.isSupportedGitService('https://example.com/forgejo2/o/r', providerByHost),
      ).toBe(false);
    });

    test('getRepositoryUrlFromLocation', () => {
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://example.com/forgejo/o/r/src/branch/main?devfilePath=devfile.yaml',
          providerByHost,
        ),
      ).toBe('https://example.com/forgejo/o/r');
      expect(
        helpers.getRepositoryUrlFromLocation('https://example.com/forgejo/o/r/', providerByHost),
      ).toBe('https://example.com/forgejo/o/r');
      // owner named "src"
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://example.com/forgejo/src/r/src/branch/main',
          providerByHost,
        ),
      ).toBe('https://example.com/forgejo/src/r');
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://example.com/forgejo/gitlab/g/p/-/tree/main',
          providerByHost,
        ),
      ).toBe('https://example.com/forgejo/gitlab/g/p');
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://example.com/bitbucket/users/u/repos/r',
          providerByHost,
        ),
      ).toBe('https://example.com/bitbucket/scm/~u/r');
    });

    test('getBranchFromLocation', () => {
      expect(
        helpers.getBranchFromLocation(
          'https://example.com/forgejo/o/r/src/branch/feature/x',
          providerByHost,
        ),
      ).toBe('feature/x');
      expect(
        helpers.getBranchFromLocation('https://example.com/forgejo/o/r', providerByHost),
      ).toBeUndefined();
      expect(
        helpers.getBranchFromLocation(
          'https://example.com/forgejo/gitlab/g/p/-/tree/dev',
          providerByHost,
        ),
      ).toBe('dev');
    });

    test('setBranchToLocation', () => {
      expect(
        helpers.setBranchToLocation('https://example.com/forgejo/o/r', 'dev', providerByHost),
      ).toBe('https://example.com/forgejo/o/r/src/branch/dev');
      expect(
        helpers.setBranchToLocation(
          'https://example.com/forgejo/o/r/src/branch/dev/',
          undefined,
          providerByHost,
        ),
      ).toBe('https://example.com/forgejo/o/r');
      expect(
        helpers.setBranchToLocation(
          'https://example.com/forgejo/o/r/src/tag/v1.0.0',
          undefined,
          providerByHost,
        ),
      ).toBe('https://example.com/forgejo/o/r/src/tag/v1.0.0');
      expect(
        helpers.setBranchToLocation(
          'https://example.com/forgejo/gitlab/g/p',
          'main',
          providerByHost,
        ),
      ).toBe('https://example.com/forgejo/gitlab/g/p/-/tree/main');
      expect(
        helpers.setBranchToLocation('https://example.com/bitbucket/a/b', 'main', providerByHost),
      ).toBe('https://example.com/bitbucket/a/b/src/main');
    });

    test('getGitRepoOptionsFromLocation and setGitRepoOptionsToLocation', () => {
      const options = helpers.getGitRepoOptionsFromLocation(
        'https://example.com/forgejo/o/r/src/branch/dev?devfilePath=.devfile.yaml',
        providerByHost,
      );
      expect(options.hasSupportedGitService).toBe(true);
      expect(options.gitBranch).toBe('dev');
      expect(
        helpers.setGitRepoOptionsToLocation(
          { gitBranch: 'main', remotes: undefined, devfilePath: undefined },
          {
            location: 'https://example.com/forgejo/o/r',
            gitBranch: undefined,
            remotes: undefined,
            devfilePath: undefined,
          },
          providerByHost,
        ).location,
      ).toBe('https://example.com/forgejo/o/r/src/branch/main');
    });

    test('root endpoints are unchanged', () => {
      expect(helpers.detectGitService('https://github.example.com/o/r', providerByHost)).toEqual({
        pathPrefix: '',
        provider: 'github',
      });
      expect(
        helpers.setBranchToLocation('https://github.example.com/o/r', 'dev', providerByHost),
      ).toBe('https://github.example.com/o/r/tree/dev');
      expect(
        helpers.getBranchFromLocation('https://github.example.com/o/r/tree/dev', providerByHost),
      ).toBe('dev');
      expect(
        helpers.getRepositoryUrlFromLocation(
          'https://github.example.com/o/r/tree/dev',
          providerByHost,
        ),
      ).toBe('https://github.example.com/o/r');
      // host name heuristic
      expect(helpers.detectGitService('https://forgejo.example.org/o/r', providerByHost)).toEqual({
        pathPrefix: '',
        provider: 'forgejo',
      });
    });
  });

  describe('getBranchFromLocation', () => {
    describe('supported GitServices', () => {
      const branch = 'main';
      describe('github', () => {
        test('should return the empty value', () => {
          expect(
            helpers.getBranchFromLocation('https://github.com/eclipse-che/che-dashboard.git'),
          ).toBeUndefined();
        });
        test('should return the branch', () => {
          expect(
            helpers.getBranchFromLocation(
              `https://github.com/eclipse-che/che-dashboard/tree/${branch}`,
            ),
          ).toBe(branch);
        });
      });
      describe('gitlab', () => {
        test('should return the empty value', () => {
          expect(
            helpers.getBranchFromLocation('https://gitlab.com/eclipse-che/che-dashboard.git'),
          ).toBeUndefined();
        });
        test('should return the branch', () => {
          expect(
            helpers.getBranchFromLocation(
              `https://gitlab.com/eclipse-che/che-dashboard/-/tree/${branch}`,
            ),
          ).toBe(branch);
        });
      });
      describe('Bitbucket', () => {
        test('should return the empty value', () => {
          expect(
            helpers.getBranchFromLocation('https://bitbucket.org/eclipse-che/che-dashboard.git'),
          ).toBeUndefined();
        });
        test('should return the branch', () => {
          expect(
            helpers.getBranchFromLocation(
              `https://bitbucket.org/eclipse-che/che-dashboard/src/${branch}`,
            ),
          ).toBe(branch);
        });
      });
      describe('Azure', () => {
        test('should return the empty value', () => {
          expect(
            helpers.getBranchFromLocation(
              'https://dev.azure.com/marioloriedo/publicproject/_git/public-repo',
            ),
          ).toBeUndefined();
        });
        test('should return the branch', () => {
          expect(
            helpers.getBranchFromLocation(
              `https://dev.azure.com/testuser/publicproject/_git/public-repo%3Fversion=GB${branch}`,
            ),
          ).toBe(branch);
        });
      });
    });

    describe('unsupported Git provider', () => {
      test('should throw the error', () => {
        let branch: string | undefined;
        let errorMessage: string | undefined;
        try {
          branch = helpers.getBranchFromLocation('https://not-supported.com');
        } catch (e) {
          errorMessage = common.helpers.errors.getMessage(e);
        } finally {
          expect(branch).toBeUndefined();
          expect(errorMessage).toBe('Provider not supported: not-supported.com');
        }
      });
    });
  });

  describe('setBranchToLocation', () => {
    describe('supported GitServices', () => {
      const branch = 'main';
      describe('Github', () => {
        test('should return the location without branch', () => {
          expect(
            helpers.setBranchToLocation(
              `https://github.com/eclipse-che/che-dashboard.git/tree/${branch}`,
              undefined,
            ),
          ).toBe('https://github.com/eclipse-che/che-dashboard.git');
        });
        test('should return the location with branch', () => {
          expect(
            helpers.setBranchToLocation('https://github.com/eclipse-che/che-dashboard.git', branch),
          ).toBe(`https://github.com/eclipse-che/che-dashboard.git/tree/${branch}`);
        });
      });
      describe('Gitlab', () => {
        test('should return the location without branch', () => {
          expect(
            helpers.setBranchToLocation(
              `https://gitlab.com/eclipse-che/che-dashboard.git/-/tree/${branch}`,
              undefined,
            ),
          ).toBe('https://gitlab.com/eclipse-che/che-dashboard.git');
        });
        test('should return the location with branch', () => {
          expect(
            helpers.setBranchToLocation('https://gitlab.com/eclipse-che/che-dashboard.git', branch),
          ).toBe(`https://gitlab.com/eclipse-che/che-dashboard.git/-/tree/${branch}`);
        });
        test('repository with subgroups', () => {
          expect(
            helpers.setBranchToLocation('https://gitlab.com/group/subgroup/repository.git', branch),
          ).toBe(`https://gitlab.com/group/subgroup/repository.git/-/tree/${branch}`);
        });
        test('repository with subgroups and branch', () => {
          expect(
            helpers.setBranchToLocation(
              'https://gitlab.com/group/subgroup/repository.git/-/tree/branch',
              branch,
            ),
          ).toBe(`https://gitlab.com/group/subgroup/repository.git/-/tree/${branch}`);
        });
      });
      describe('Bitbucket', () => {
        test('should return the location without branch', () => {
          expect(
            helpers.setBranchToLocation(
              `https://bitbucket.org/eclipse-che/che-dashboard.git/src/${branch}`,
              undefined,
            ),
          ).toBe('https://bitbucket.org/eclipse-che/che-dashboard.git');
        });
        test('should return the location with branch', () => {
          expect(
            helpers.setBranchToLocation(
              'https://bitbucket.org/eclipse-che/che-dashboard.git',
              branch,
            ),
          ).toBe(`https://bitbucket.org/eclipse-che/che-dashboard.git/src/${branch}`);
        });
      });
      describe('Azure', () => {
        test('should return the location without branch', () => {
          expect(
            helpers.setBranchToLocation(
              `https://dev.azure.com/testuser/publicproject/_git/public-repo%3Fpath=%2F&version=GB${branch}`,
              undefined,
            ),
          ).toBe('https://dev.azure.com/testuser/publicproject/_git/public-repo%3Fpath%3D%252F');
        });
        test('should return the location with branch', () => {
          expect(
            helpers.setBranchToLocation(
              'https://dev.azure.com/testuser/publicproject/_git/public-repo',
              branch,
            ),
          ).toBe(
            `https://dev.azure.com/testuser/publicproject/_git/public-repo%3Fversion%3DGB${branch}`,
          );
        });
      });
    });
    describe('unsupported Git provider', () => {
      test('should throw the error', () => {
        let location: string | undefined;
        let errorMessage: string | undefined;
        try {
          location = helpers.setBranchToLocation('https://not-supported.com', 'main');
        } catch (e) {
          errorMessage = common.helpers.errors.getMessage(e);
        } finally {
          expect(location).toBeUndefined();
          expect(errorMessage).toBe('Provider not supported: not-supported.com');
        }
      });
    });
    describe('ssh url', () => {
      test('should return url with branch', () => {
        const branch = 'branch';
        expect(helpers.setBranchToLocation('git@ssh-url.git', branch)).toBe(
          `git@ssh-url.git?revision=${branch}`,
        );
      });
      test('should return url without branch', () => {
        expect(helpers.setBranchToLocation('git@ssh-url.git', undefined)).toBe('git@ssh-url.git');
      });
    });
  });
  describe('getGitRepoOptionsFromLocation', () => {
    describe('supported Git services', () => {
      describe('HTTP', () => {
        test('should return options from location without parameters', () => {
          const location = 'https://github.com/eclipse-che/che-dashboard.git';
          const options = helpers.getGitRepoOptionsFromLocation(location);
          expect(options).toEqual({
            location: 'https://github.com/eclipse-che/che-dashboard.git',
            hasSupportedGitService: true,
            gitBranch: undefined,
            remotes: [],
            devfilePath: undefined,
          });
        });
        test('should return options from location with params with empty values', () => {
          let options = helpers.getGitRepoOptionsFromLocation(
            'https://github.com/eclipse-che/che-dashboard.git?remotes&devfilePath',
          );
          expect(options).toEqual({
            location: 'https://github.com/eclipse-che/che-dashboard.git',
            hasSupportedGitService: true,
            gitBranch: undefined,
            remotes: undefined,
            devfilePath: undefined,
          });

          options = helpers.getGitRepoOptionsFromLocation(
            'https://github.com/eclipse-che/che-dashboard.git?remotes={}&df',
          );

          expect(options).toEqual({
            location: 'https://github.com/eclipse-che/che-dashboard.git',
            hasSupportedGitService: true,
            gitBranch: undefined,
            remotes: undefined,
            devfilePath: undefined,
          });
        });
        test('should return all supported options', () => {
          const location =
            'https://github.com/eclipse-che/che-dashboard/tree/main?remotes={{test-1,http://test-1.git}}&df=devfile2.yaml';
          const options = helpers.getGitRepoOptionsFromLocation(location);
          expect(options).toEqual({
            location:
              'https://github.com/eclipse-che/che-dashboard/tree/main?remotes=%7B%7Btest-1%2Chttp%3A%2F%2Ftest-1.git%7D%7D&devfilePath=devfile2.yaml',
            hasSupportedGitService: true,
            gitBranch: 'main',
            remotes: [{ name: 'test-1', url: 'http://test-1.git' }],
            devfilePath: 'devfile2.yaml',
          });
        });
      });
      describe('SSH', () => {
        test('should return options from location without parameters', () => {
          const location = 'git@github.com:eclipse-che/che-dashboard.git';
          const options = helpers.getGitRepoOptionsFromLocation(location);
          expect(options).toEqual({
            location: 'git@github.com:eclipse-che/che-dashboard.git',
            hasSupportedGitService: false,
            gitBranch: undefined,
            remotes: [],
            devfilePath: undefined,
          });
        });
        test('should return all supported options', () => {
          const location =
            'git@github.com:eclipse-che/che-dashboard.git?remotes={{test-1,http://test-1.git}}&df=devfile2.yaml';
          const options = helpers.getGitRepoOptionsFromLocation(location);
          expect(options).toEqual({
            location:
              'git@github.com:eclipse-che/che-dashboard.git?remotes=%7B%7Btest-1%2Chttp%3A%2F%2Ftest-1.git%7D%7D&devfilePath=devfile2.yaml',
            hasSupportedGitService: false,
            gitBranch: undefined,
            remotes: [{ name: 'test-1', url: 'http://test-1.git' }],
            devfilePath: 'devfile2.yaml',
          });
        });
      });
    });
    describe('unsupported Git provider', () => {
      test('should return all supported variants except the branch', () => {
        const location =
          'https://not-supported.com?remotes={{test-1,http://test-1.git}}&df=devfile2.yaml';
        const options = helpers.getGitRepoOptionsFromLocation(location);
        expect(options).toEqual({
          location:
            'https://not-supported.com?remotes=%7B%7Btest-1%2Chttp%3A%2F%2Ftest-1.git%7D%7D&devfilePath=devfile2.yaml',
          hasSupportedGitService: false,
          gitBranch: undefined,
          remotes: [{ name: 'test-1', url: 'http://test-1.git' }],
          devfilePath: 'devfile2.yaml',
          containerImage: undefined,
          temporaryStorage: undefined,
          createNewIfExisting: undefined,
          memoryLimit: undefined,
          cpuLimit: undefined,
        });
      });
    });
  });

  describe('getAdvancedOptionsFromLocation', () => {
    describe('HTTP', () => {
      test('should return options from location without parameters', () => {
        const location = 'https://github.com/eclipse-che/che-dashboard.git';
        const options = helpers.getAdvancedOptionsFromLocation(location);
        expect(options).toEqual({
          location: 'https://github.com/eclipse-che/che-dashboard.git',
          containerImage: undefined,
          temporaryStorage: undefined,
          createNewIfExisting: undefined,
          memoryLimit: undefined,
          cpuLimit: undefined,
        });
      });
      test('should return options from location with params with empty values', () => {
        const location =
          'https://github.com/eclipse-che/che-dashboard.git?image&policies.create&memoryLimit&storageType';
        const options = helpers.getAdvancedOptionsFromLocation(location);
        expect(options).toEqual({
          location: 'https://github.com/eclipse-che/che-dashboard.git',
          containerImage: undefined,
          temporaryStorage: undefined,
          createNewIfExisting: undefined,
          memoryLimit: undefined,
          cpuLimit: undefined,
        });
      });
      test('should return all supported options', () => {
        const location =
          'https://github.com/eclipse-che/che-dashboard/tree/main?image=custom-image&new&memoryLimit=2Gi&cpuLimit=1&storageType=ephemeral';
        const options = helpers.getAdvancedOptionsFromLocation(location);
        expect(options).toEqual({
          location:
            'https://github.com/eclipse-che/che-dashboard/tree/main?storageType=ephemeral&image=custom-image&cpuLimit=1&memoryLimit=2Gi&new',
          containerImage: 'custom-image',
          temporaryStorage: true,
          createNewIfExisting: true,
          memoryLimit: 2147483648,
          cpuLimit: 1,
        });
      });
    });
    describe('SSH', () => {
      test('should return options from location without parameters', () => {
        const location = 'git@github.com:eclipse-che/che-dashboard.git';
        const options = helpers.getAdvancedOptionsFromLocation(location);
        expect(options).toEqual({
          location: 'git@github.com:eclipse-che/che-dashboard.git',
          containerImage: undefined,
          temporaryStorage: undefined,
          createNewIfExisting: undefined,
          memoryLimit: undefined,
          cpuLimit: undefined,
        });
      });
      test('should return all supported options', () => {
        const location =
          'git@github.com:eclipse-che/che-dashboard.git?image=custom-image&new&memoryLimit=2Gi&cpuLimit=1&storageType=ephemeral';
        const options = helpers.getAdvancedOptionsFromLocation(location);
        expect(options).toEqual({
          location:
            'git@github.com:eclipse-che/che-dashboard.git?storageType=ephemeral&image=custom-image&cpuLimit=1&memoryLimit=2Gi&new',
          containerImage: 'custom-image',
          temporaryStorage: true,
          createNewIfExisting: true,
          memoryLimit: 2147483648,
          cpuLimit: 1,
        });
      });
    });
  });

  describe('setGitRepoOptionsToLocation', () => {
    describe('supported Git services', () => {
      describe('HTTP', () => {
        test('should return options with updated location(set search params)', () => {
          const newOptions = {
            gitBranch: 'test-branch',
            remotes: [{ name: 'test-2', url: 'http://test-2.git' }],
            devfilePath: 'devfile3.yaml',
          };
          const currentOptions = {
            location: 'https://github.com/eclipse-che/che-dashboard/tree/main',
            gitBranch: undefined,
            remotes: undefined,
            devfilePath: undefined,
          };
          const options = helpers.setGitRepoOptionsToLocation(newOptions, currentOptions);
          expect(options).toEqual({
            location:
              'https://github.com/eclipse-che/che-dashboard/tree/test-branch?remotes={{test-2,http://test-2.git}}&devfilePath=devfile3.yaml',
            gitBranch: 'test-branch',
            remotes: [{ name: 'test-2', url: 'http://test-2.git' }],
            devfilePath: 'devfile3.yaml',
          });
        });
        test('should return options with updated location(reset search params)', () => {
          const newOptions = {
            gitBranch: undefined,
            remotes: undefined,
            devfilePath: undefined,
          };
          const currentOptions = {
            location:
              'https://github.com/eclipse-che/che-dashboard/tree/main?remotes={{test-1,http://test-1.git}}&df=devfile2.yaml',
            gitBranch: 'main',
            remotes: [{ name: 'test-1', url: 'http://test-1.git' }],
            devfilePath: 'devfile2.yaml',
          };
          const options = helpers.setGitRepoOptionsToLocation(newOptions, currentOptions);
          expect(options).toEqual({
            location: 'https://github.com/eclipse-che/che-dashboard',
            gitBranch: undefined,
            remotes: undefined,
            devfilePath: undefined,
          });
        });
      });
      describe('SSH', () => {
        test('should return options with updated location', () => {
          const newOptions = {
            gitBranch: undefined,
            remotes: [{ name: 'test-2', url: 'http://test-2.git' }],
            devfilePath: 'devfile3.yaml',
          };
          const currentOptions = {
            location:
              'git@github.com:eclipse-che/che-dashboard.git?remotes={{test-1,http://test-1.git}}&df=devfile2.yaml',
            gitBranch: undefined,
            remotes: [{ name: 'test-1', url: 'http://test-1.git' }],
            devfilePath: 'devfile2.yaml',
          };
          const options = helpers.setGitRepoOptionsToLocation(newOptions, currentOptions);
          expect(options).toEqual({
            location:
              'git@github.com:eclipse-che/che-dashboard.git?remotes={{test-2,http://test-2.git}}&devfilePath=devfile3.yaml',
            gitBranch: undefined,
            remotes: [{ name: 'test-2', url: 'http://test-2.git' }],
            devfilePath: 'devfile3.yaml',
          });
        });
      });
      describe('unsupported Git provider', () => {
        test('should return options with updated location', () => {
          const newOptions = {
            gitBranch: undefined,
            remotes: [{ name: 'test-2', url: 'http://test-2.git' }],
            devfilePath: 'devfile3.yaml',
          };
          const currentOptions = {
            location:
              'http://not-supported.com?remotes={{test-1,http://test-1.git}}&df=devfile2.yaml',
            gitBranch: undefined,
            remotes: [{ name: 'test-1', url: 'http://test-1.git' }],
            devfilePath: 'devfile2.yaml',
          };
          const options = helpers.setGitRepoOptionsToLocation(newOptions, currentOptions);
          expect(options).toEqual({
            location:
              'http://not-supported.com?remotes={{test-2,http://test-2.git}}&devfilePath=devfile3.yaml',
            gitBranch: undefined,
            remotes: [{ name: 'test-2', url: 'http://test-2.git' }],
            devfilePath: 'devfile3.yaml',
          });
        });
      });
    });
  });
  describe('setAdvancedOptionsToLocation', () => {
    describe('supported Git services', () => {
      describe('HTTP', () => {
        test('should return options with updated location(set search params)', () => {
          const newOptions = {
            containerImage: 'custom-image',
            temporaryStorage: true,
            createNewIfExisting: true,
            memoryLimit: 2147483648,
            cpuLimit: 1,
          };
          const currentOptions = {
            location: 'https://github.com/eclipse-che/che-dashboard.git',
            containerImage: undefined,
            temporaryStorage: undefined,
            createNewIfExisting: undefined,
            memoryLimit: undefined,
            cpuLimit: undefined,
          };
          const options = helpers.setAdvancedOptionsToLocation(newOptions, currentOptions);
          expect(options).toEqual({
            location:
              'https://github.com/eclipse-che/che-dashboard.git?image=custom-image&storageType=ephemeral&new&memoryLimit=2Gi&cpuLimit=1',
            containerImage: 'custom-image',
            temporaryStorage: true,
            createNewIfExisting: true,
            memoryLimit: 2147483648,
            cpuLimit: 1,
          });
        });
        test('should return options with updated location(reset search params)', () => {
          const newOptions = {
            containerImage: undefined,
            temporaryStorage: undefined,
            createNewIfExisting: undefined,
            memoryLimit: undefined,
            cpuLimit: undefined,
          };
          const currentOptions = {
            location: 'https://github.com/eclipse-che/che-dashboard.git',
            containerImage: 'custom-image',
            temporaryStorage: true,
            createNewIfExisting: true,
            memoryLimit: 2147483648,
            cpuLimit: undefined,
          };
          const options = helpers.setAdvancedOptionsToLocation(newOptions, currentOptions);
          expect(options).toEqual({
            location: 'https://github.com/eclipse-che/che-dashboard.git',
            containerImage: undefined,
            temporaryStorage: undefined,
            createNewIfExisting: undefined,
            memoryLimit: undefined,
            cpuLimit: undefined,
          });
        });
      });
      describe('SSH', () => {
        test('should return options with updated location', () => {
          const newOptions = {
            containerImage: 'custom-image',
            temporaryStorage: true,
            createNewIfExisting: true,
            memoryLimit: 2147483648,
            cpuLimit: 1,
          };
          const currentOptions = {
            location: 'git@github.com:eclipse-che/che-dashboard.git',
            containerImage: undefined,
            temporaryStorage: undefined,
            createNewIfExisting: undefined,
            memoryLimit: undefined,
            cpuLimit: undefined,
          };
          const options = helpers.setAdvancedOptionsToLocation(newOptions, currentOptions);
          expect(options).toEqual({
            location:
              'git@github.com:eclipse-che/che-dashboard.git?image=custom-image&storageType=ephemeral&new&memoryLimit=2Gi&cpuLimit=1',
            containerImage: 'custom-image',
            temporaryStorage: true,
            createNewIfExisting: true,
            memoryLimit: 2147483648,
            cpuLimit: 1,
          });
        });
      });
    });
  });
  describe('units of memory measurements', () => {
    describe('getBytes', () => {
      test('should return Bytes depends on measurements', () => {
        const values = [
          '', // error value
          '534',
          '1 KB',
          '4.5Mi',
          '10Gi',
          '1.5 TiB',
          '2.5 PiB',
          '2QQQ', // error value
          'undefined', // error value
        ].map(val => getBytes(val));

        expect(values).toEqual([
          undefined,
          534,
          1000,
          4718592,
          10737418240,
          1649267441664,
          2814749767106560,
          undefined,
          undefined,
        ]);
      });
    });
    describe('formatBytes', () => {
      test('should return formated memory measurements', () => {
        const values = [
          0,
          534,
          4718592,
          10737418240,
          1649267441664,
          2814749767106560,
          undefined,
        ].map(val => formatBytes(val, 2, false));

        expect(values).toEqual([undefined, '534', '4.72M', '10.74G', '1.65T', '2.81P', undefined]);
      });
      test('should return formated memory measurements(binaryUnits)', () => {
        const values = [
          0,
          534,
          1000,
          4718592,
          10737418240,
          1649267441664,
          2814749767106560,
          undefined,
        ].map(val => formatBytes(val));

        expect(values).toEqual([
          undefined,
          '534',
          '1000',
          '4.5Mi',
          '10Gi',
          '1.5Ti',
          '2.5Pi',
          undefined,
        ]);
      });
    });
    describe('searchParamsToString', () => {
      test('should return the string without empty values', () => {
        const params = new URLSearchParams();
        params.set('key1', 'value1');
        params.set('key2', 'value2');
        params.set('key3', '');
        params.set('key4', '');
        const paramsStr = helpers.searchParamsToString(params);
        expect(paramsStr).toEqual('key1=value1&key2=value2&key3&key4');
      });
    });
  });
});
