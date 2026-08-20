import {
  bumpSemver,
  compareSemver,
  parseBumpArgs,
  parseSemver,
  resolveNextVersion,
} from '../../../scripts/android-version.js';

describe('android-version', () => {
  it('parseia semver X.Y.Z', () => {
    expect(parseSemver('1.0.129')).toEqual({ major: 1, minor: 0, patch: 129 });
  });

  it('rejeita versão incompleta', () => {
    expect(() => parseSemver('1.1')).toThrow(/inválida/);
  });

  it('sobe patch / minor / major', () => {
    expect(bumpSemver('1.0.129', 'patch')).toBe('1.0.130');
    expect(bumpSemver('1.0.129', 'minor')).toBe('1.1.0');
    expect(bumpSemver('1.0.129', 'major')).toBe('2.0.0');
  });

  it('compara semver numericamente (129 < 130, não como string)', () => {
    expect(compareSemver('1.0.129', '1.0.9')).toBe(1);
    expect(compareSemver('1.1.0', '1.0.129')).toBe(1);
    expect(compareSemver('1.1.0', '1.1.0')).toBe(0);
  });

  it('default é patch; flags conflitantes abortam', () => {
    expect(parseBumpArgs([])).toEqual({ bump: 'patch', exact: null });
    expect(parseBumpArgs(['--minor'])).toEqual({ bump: 'minor', exact: null });
    expect(parseBumpArgs(['--version', '1.1.0'])).toEqual({ bump: 'exact', exact: '1.1.0' });
    expect(parseBumpArgs(['--keep'])).toEqual({ bump: 'keep', exact: null });
    expect(() => parseBumpArgs(['--minor', '--patch'])).toThrow(/conflitantes/);
  });

  it('resolveNextVersion: keep / exact / bump', () => {
    expect(resolveNextVersion('1.1.0', { bump: 'keep', exact: null })).toBe('1.1.0');
    expect(resolveNextVersion('1.0.129', { bump: 'minor', exact: null })).toBe('1.1.0');
    expect(resolveNextVersion('1.0.129', { bump: 'exact', exact: '1.1.0' })).toBe('1.1.0');
    expect(() => resolveNextVersion('1.1.0', { bump: 'exact', exact: '1.1.0' })).toThrow(/maior/);
  });
});
