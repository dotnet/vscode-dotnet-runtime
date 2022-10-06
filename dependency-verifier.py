import sys
import subprocess

targetBranch = sys.argv[1]

result = subprocess.getoutput(f"git diff --name-only {targetBranch}..")
sys.exit(result)
sys.exit(f"The yarn.lock and package-lock appear to be out of sync on {targetBranch}. Update by doing yarn import or yarn add for the following dependencies.")
