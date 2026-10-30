# PR-143 post-merge audit: cross-OS rerun

Temporary audit branch. The workflow checks out the original PR-143 merge (749b2e4), PR-148 (ab3cc3c) and PR-149 (51b2d1e) from kanghyunsoon/duo on Ubuntu, macOS and Windows. It then runs the same audit checks that were run locally on Windows and WSL Ubuntu: focused lock/refresh tests, user-file protection, killed writer, C2/C5 concurrency and the hard-link reproduction. Nothing here is proposed for merge.
