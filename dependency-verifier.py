import sys
import subprocess

def main():
    """Check if the dependency updates in package-lock are also updated in yarn.locks"""
    targetBranch = sys.argv[1] # Script is called with PR Target Branch Name, Fulfilled by AzDo
    subprocess.getoutput(f"git fetch --all")
    sys.exit(subprocess.getoutput(f"git branch --all"))
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

def NpmChangesMirrorYarnChanges(changedFiles, packageLockPath, targetBranch):
    """Returns successfully if yarn.lock matches packagelock changes, if not, throws exit code"""
    yarnLockFile = "yarn.lock"
    yarnLockPath = os.path.join(os.path.dirname(packageLockPath), yarnLockFile)
    

main()




sys.exit(f"The yarn.lock and package-lock appear to be out of sync. Update by doing yarn import or yarn add for the following dependencies.")
