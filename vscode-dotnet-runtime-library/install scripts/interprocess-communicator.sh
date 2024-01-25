#!/usr/bin/env bash
EXECFOLDER=$1 # First argument is the working folder as this is launched with cwd of /root
OKSIGNALFILE="$EXECFOLDER/ok.txt"
COMMANDTORUNFILE="$EXECFOLDER/command.txt"
OUTPUTFILE="/home/viru/vm.txt"
while true
do
        stop=false
        until ((stop))
        do
            sleep 5
            echo $(ls) >> "$OUTPUTFILE"
            echo "$EXECFOLDER" >> "$OUTPUTFILE"
            echo $(ls EXECFOLDER) >> "$OUTPUTFILE"
            echo "$OKSIGNALFILE" >> "$OUTPUTFILE"
            echo "$COMMANDTORUNFILE" >> "$OUTPUTFILE"
            if test -f "$COMMANDTORUNFILE"; then
                echo "COMMAND FILE FOUND" >> "$OUTPUTFILE"
                COMMAND="$(cat "$COMMANDTORUNFILE" | awk '{$1=$1;print}')"
                for validCmd in "${@:2}"
                do
                    echo "$COMMAND" >> "$OUTPUTFILE"
                    echo "$validCmd" >> "$OUTPUTFILE"
                    if [ "$COMMAND" == "$validCmd" ]; then
                        IFS=' ' read -ra COMMANDARGS <<< "$COMMAND"
                        echo "VALID CMD FOUND" >> "$OUTPUTFILE"
                    fi
                done
                if [ -z "$COMMANDARGS" ]; then
                    echo "INVALID CMD FOUND" >> "$OUTPUTFILE"
                    exit 111777 # Special exit code - arbitrarily picked for when the command is not expected
                fi
                OUT=$(sudo "${COMMANDARGS[@]}" 2> errFile)
                STATUSCODE=$?
                ERR=$(<errFile)
                rm "errFile"
                rm "$COMMANDTORUNFILE"
                cat >| "$EXECFOLDER/stderr.txt" << EOF
$ERR
EOF
                cat >| "$EXECFOLDER/stdout.txt" << EOF
$OUT
EOF
                cat >| "$EXECFOLDER/status.txt" << EOF
$STATUSCODE
EOF
                cat >| "$EXECFOLDER/output.json" << EOF
" "
EOF
            fi
            if test -f "$OKSIGNALFILE"; then
                echo "OK SIGNAL FILE FOUND" >> "$OUTPUTFILE"
                rm "$OKSIGNALFILE"
            fi
            echo "RELOOP" >> "$OUTPUTFILE"
        done
done
