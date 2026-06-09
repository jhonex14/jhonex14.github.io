import subprocess
import time
import os
import datetime

# Configuration
CHECK_INTERVAL_SECONDS = 15  # Check for changes every 15 seconds
COMMIT_MESSAGE = "Auto update: "

def has_changes():
    """Checks if there are any uncommitted changes in the git repository."""
    try:
        # Check for modified, deleted, or untracked files
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            capture_output=True,
            text=True,
            check=True
        )
        return len(result.stdout.strip()) > 0
    except subprocess.CalledProcessError as e:
        print(f"Error checking git status: {e}")
        return False

def push_changes():
    """Adds, commits, and pushes all changes."""
    try:
        print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Changes detected! Committing and pushing...")
        
        # Add all changes
        subprocess.run(['git', 'add', '.'], check=True)
        
        # Commit changes
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        subprocess.run(['git', 'commit', '-m', f"{COMMIT_MESSAGE} {timestamp}"], check=True)
        
        # Push changes to trigger GitHub Actions
        subprocess.run(['git', 'push'], check=True)
        
        print("Push successful. GitHub Action (APK Build) should be triggered.")
    except subprocess.CalledProcessError as e:
        print(f"Error during git operations: {e}")

if __name__ == "__main__":
    print("==================================================")
    print("Auto-Push Script Started")
    print("Monitoring for file changes to trigger APK builds.")
    print("Press Ctrl+C to stop.")
    print("==================================================")
    
    try:
        while True:
            if has_changes():
                push_changes()
            
            time.sleep(CHECK_INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nAuto-Push script stopped by user.")
