import sys
import subprocess
import os
from pathlib import Path


def main():
    """Check if the dependency updates in package-lock are also updated in yarn.locks"""
    targetBranch = sys.argv[1] # Script is called with PR Target Branch Name, Fulfilled by AzDo
    subprocess.getoutput(f"git fetch --all")
    subprocess.getoutput(f"git pull origin {targetBranch}")
    VerifyDependencies(targetBranch)
    sys.exit(0)

def VerifyDependencies(targetBranch):
    """Enumerate through all changed files to check diffs."""
    # origin/ requires origin/ to be up to date.
    changedFiles = [Path(path) for path in subprocess.getoutput(f"git diff --name-only origin/{targetBranch}..").splitlines()]
    npmLockFile = "package-lock.json"

    for file in changedFiles:
        fileName = os.path.basename(os.path.realpath(file))
        if fileName == npmLockFile:
            NpmChangesMirrorYarnChanges(changedFiles, file, targetBranch)

def GetNpmDependencyUpdates(packageLockDiffLines):
    """Returns a dictionary of [dependency -> [] (can be changed to version in later implementations)] changes found in diff string of package-lock.json"""
    # Assumes dependency line starts with "node_modules/DEPENDENCYNAME". Version may or may not come after
    dependencies = {}
    for line in packageLockDiffLines:
        line = line.strip()
        line = line.lstrip("\t")
        if line.startswith('"node_modules/'):
            dependencies[line.split('"node_modules/', 1)[1].split('"', 1)[0]] = [] # will be "node_modules/dep further" content, need to cull
    return dependencies

def GetYarnDependencyUpdates(yarnLockDiffLines):
    """Returns a dictionary of [dependency -> [] (can be changed to version in later implementations)] changes found in diff string of yarn.lock"""
    # Assumes dependency line starts with DEPEDENCY@Version without whitespace
    dependencies = {}
    for line in yarnLockDiffLines:
        if line == line.lstrip() and "@" in line:
            depsAtVers = line.lstrip('"').split(",") # multiple dependencies are possible with diff versions, sep by ,
            for dependencyAtVers in depsAtVers:
                dep = dependencyAtVers.rsplit("@", 1)[0]
                vers = dependencyAtVers.rsplit("@", 1)[1]
                dependencies[dep] = [] # Could add version here later. That will probably not happen
    return dependencies

def GetUnmatchedDiffs(yarnDiff, npmDiff):
    """Returns [] if dependency updates are reflected in both diffs, elsewise the dependencies out of sync."""
                                        # v Remove + or - from diff and additional git diff context lines
    yarnDeps = GetYarnDependencyUpdates([line[1:] for line in yarnDiff.splitlines() if line.startswith("+") or line.startswith("-")])
    npmDeps = GetNpmDependencyUpdates([line[1:] for line in npmDiff.splitlines() if line.startswith("+") or line.startswith("-")])
    outOfSyncDependencies = []
    for dep in npmDeps:
        if dep in yarnDeps and yarnDeps[dep] == npmDeps[dep]: # version changes match
            continue
        else:
            outOfSyncDependencies.append(dep)
    return outOfSyncDependencies

def NpmChangesMirrorYarnChanges(changedFiles, packageLockPath, targetBranch):
    """Returns successfully if yarn.lock matches packagelock changes, if not, throws exit code"""
    yarnLockFile = "yarn.lock"
    yarnLockPath = Path(os.path.join(os.path.dirname(packageLockPath), yarnLockFile))
    outOfDateYarnLocks = []

    if yarnLockPath in changedFiles:
        yarnDiff = subprocess.getoutput(f"git diff origin/{targetBranch}.. -- {str(yarnLockPath)}")
        npmDiff = subprocess.getoutput(f"git diff origin/{targetBranch}..  -- {packageLockPath}")
        diffSetComplement = GetUnmatchedDiffs(yarnDiff, npmDiff)
        if diffSetComplement == []:
           pass
        else:
            outOfDateYarnLocks.append((str(yarnLockPath), diffSetComplement))
    else:
        outOfDateYarnLocks.append(yarnLockPath)
    if(outOfDateYarnLocks != []):
        sys.exit(f"The yarn.lock and package-lock appear to be out of sync with the changes made after {targetBranch}. Update by doing yarn import or yarn add dep@package-lock-version for {outOfDateYarnLocks}. For sub-dependencies, try adding just the main dependency first.")
    else:
        return 0 # OK, status here is not used

if __name__ == "__main__":
    main()