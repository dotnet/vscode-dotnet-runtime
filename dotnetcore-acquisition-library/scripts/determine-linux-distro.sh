#!/usr/bin/env bash
#
# Copyright © Microsoft Corporation
# All rights reserved.
#
# Licensed under the MIT License. See LICENSE-CODE in the project root for details.
#
# Exit codes:
# 0 - Success
# 4 - Distribution not supported by script
#

set H+

#openSUSE - Has to be first since apt-get is available but package names different
if type zypper > /dev/null 2>&1; then
    echo "SUSE"
    exit 0

# Debian / Ubuntu
elif type apt-get > /dev/null 2>&1; then
    echo "Debian"
    exit 0

#RHL/Fedora/CentOS
elif type yum > /dev/null 2>&1; then
    echo "RedHat"
    exit 0

#ArchLinux
elif type pacman > /dev/null 2>&1; then
    echo "ArchLinux"
    exit 0

#Solus
elif type eopkg > /dev/null 2>&1; then
    echo "Solus"
    exit 0

#Alpine Linux
elif type apk > /dev/null 2>&1; then
    echo "Alpine"
    exit 0

# Distro not supported
else
   echo "UNKNOWN"
   exit 4
fi
