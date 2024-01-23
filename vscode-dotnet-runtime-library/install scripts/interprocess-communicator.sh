#!/bin/bash
OKSIGNALFILE=./ok.txt
COMMANDTORUNFILE=./command.sh
while true
do
        stop=false
        until ((stop))
        do
            sleep 5
            if test -f "$COMMANDTORUNFILE"; then
                COMMAND="$(cat "$COMMANDTORUNFILE" | awk '{$1=$1;print}')"
                for validCmd in "$@"
                do
                    if [ "$COMMAND" == "$validCmd" ]; then
                        IFS=' ' read -ra COMMANDARGS <<< "$COMMAND"
                    fi
                done
                if [ -z "$COMMANDARGS" ]; then
                    exit 111777 # Special exit code - arbitrarily picked for when the command is not expected
                fi
                OUT=$(sudo "${COMMANDARGS[@]}" 2> errFile)
                STATUSCODE=$?
                ERR=$(<errFile)
                rm "errFile"
                rm "$COMMANDTORUNFILE"
                cat > output.json << EOF
{
    "stdout": "$OUT",
    "stderr": "$ERR",
    "status": "$STATUSCODE"
}
EOF
            fi
            if test -f "$OKSIGNALFILE"; then
                rm "$OKSIGNALFILE"
            fi
        done
done