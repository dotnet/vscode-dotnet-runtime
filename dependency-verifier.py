import sys
import subprocess

def main():
    """Check if the dependency updates in package-lock are also updated in yarn.locks"""
    targetBranch = sys.argv[1] # Script is called with PR Target Branch Name, Fulfilled by AzDo
    subprocess.getoutput(f"git fetch --all")
    sys.exit(subprocess.getoutput(f"git pull origin {targetBranch}"))
    VerifyDependencies(targetBranch)
    sys.exit(0)

def VerifyDependencies(targetBranch):
    """Enumerate through all changed files to check diffs."""
    changedFiles = subprocess.getoutput(f"git diff --name-only {targetBranch}..")
    npmLockFile = "package-lock.json"
    
    for file in changedFiles:
        fileName = os.path.basename(os.path.realpath(file))
        if fileName == npmLockFile:
            NpmChangesMirrorYarnChanges(changedFiles, file, targetBranch)

def GetNpmDependencyUpdates(packageLockDiff):
    """Returns a dictionary of [dependency -> [] (can be changed to version in later implementations)] changes found in diff string of package-lock.json"""
    # Assumes dependency line starts with "node_modules/DEPENDENCYNAME". Version may or may not come after
    dependencies = {}
    for line in packageLockDiff.splitlines():
        if line.strip().startswith("node_modules/"):
            dependencies[line.strip().split("node_modules/", 1)[1]] = []
    return dependencies

def GetYarnDependencyUpdates(yarnLockDiff):
    """Returns a dictionary of [dependency -> [] (can be changed to version in later implementations)] changes found in diff string of yarn.lock"""
    # Assumes dependency line starts with "DEPEDENCY@Version"
    dependencies = {}
    for line in yarnLockDiff.splitlines():
        if line.startswith('"'):
            depAtVers = line.split('"', 1)[1]
            dep = depAtVers.rsplit("@", 1)[0]
            vers = depAtVers.rsplit("@", 1)[1]
            dependencies[dep] = [] # Could add version here later. (TODO) that will probably not happen
    return dependencies

def DiffsMatch(yarnDiff, npmDiff):
    """Returns true if dependency updates are reflected in both diffs."""
    yarnDeps = GetYarnDependencyUpdates(yarnDiff)
    npmDeps = GetNpmDependencyUpdates(npmDiff)
    for dep in npmDeps:
        if dep in yarnDeps and yarnDeps[dep] == npmDeps[dep]: # version changes match
            continue
        else:
            return False
    return True

def NpmChangesMirrorYarnChanges(changedFiles, packageLockPath, targetBranch):
    """Returns successfully if yarn.lock matches packagelock changes, if not, throws exit code"""
    yarnLockFile = "yarn.lock"
    yarnLockPath = os.path.join(os.path.dirname(packageLockPath), yarnLockFile)
    outOfDateYarnLocks = []
    
    if yarnLockPath in changedFiles:
        yarnDiff = subprocess.getoutput(f"git diff {targetBranch}.. {yarnLockPath}")
        npmDiff = subprocess.getoutput(f"git diff {targetBranch}.. {packageLockPath}")
        if DiffsMatch(yarnDiff, npmDiff):
           pass
        else:
            outOfDateYarnLocks += yarnLockPath
    else:
        outOfDateYarnLocks += yarnLockPath
    if(outOfDateYarnLocks != []):
        sys.exit(f"The yarn.lock and package-lock appear to be out of sync with the changes made after {targetBranch}. Update by doing yarn import or yarn add for {outOfDateYarnLocks}.")
    else:
        return 0 # OK, status here is not used

main()




