import subprocess
import time
import os
import datetime
import shutil

# Configuration
CHECK_INTERVAL_SECONDS = 15  # Check for changes every 15 seconds
COMMIT_MESSAGE = "Auto update:"

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ANDROID_DIR = os.path.join(SCRIPT_DIR, "android")
APK_SOURCE = os.path.join(ANDROID_DIR, "app", "build", "outputs", "apk", "debug", "app-debug.apk")
APK_DEST = os.path.join(SCRIPT_DIR, "app-debug.apk")
WWW_DIR = os.path.join(SCRIPT_DIR, "www")

def has_changes():
    """Checks if there are any uncommitted changes in the git repository."""
    try:
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            capture_output=True, text=True, check=True,
            cwd=SCRIPT_DIR
        )
        return len(result.stdout.strip()) > 0
    except subprocess.CalledProcessError as e:
        print(f"Error checking git status: {e}")
        return False

def sync_capacitor():
    """Syncs web files into the Android project using Capacitor."""
    try:
        print("  -> Syncing web assets to Android via Capacitor...")
        os.makedirs(WWW_DIR, exist_ok=True)
        for f in os.listdir(SCRIPT_DIR):
            if f.endswith(('.html', '.css', '.js', '.json', '.png', '.jpg')):
                shutil.copy2(os.path.join(SCRIPT_DIR, f), os.path.join(WWW_DIR, f))
        subprocess.run(
            ['npx', 'cap', 'sync', 'android'],
            cwd=SCRIPT_DIR, check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        print("  -> Capacitor sync complete.")
        return True
    except Exception as e:
        print(f"  -> Warning: Capacitor sync failed: {e}")
        return False

def build_apk():
    """Builds the Android APK locally using Gradle."""
    gradlew = os.path.join(ANDROID_DIR, "gradlew.bat")
    if not os.path.exists(gradlew):
        print("  -> gradlew.bat not found, skipping local APK build.")
        return False
    try:
        print("  -> Building APK with Gradle (this may take a minute)...")
        result = subprocess.run(
            [gradlew, 'assembleDebug', '--quiet', '--no-daemon'],
            cwd=ANDROID_DIR, check=True,
            capture_output=True, text=True, timeout=300
        )
        if os.path.exists(APK_SOURCE):
            shutil.copy2(APK_SOURCE, APK_DEST)
            size_mb = os.path.getsize(APK_DEST) / (1024 * 1024)
            print(f"  -> APK built successfully! ({size_mb:.1f} MB) -> app-debug.apk")
            return True
        else:
            print("  -> APK file not found after build.")
            return False
    except subprocess.TimeoutExpired:
        print("  -> APK build timed out (>5 min). Will retry next cycle.")
        return False
    except subprocess.CalledProcessError as e:
        print(f"  -> APK build failed: {e.stderr[-500:] if e.stderr else e}")
        return False

def push_changes():
    """Adds, commits, and pushes all changes to GitHub."""
    try:
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] Changes detected! Committing and pushing...")
        subprocess.run(['git', 'add', '.'], check=True, cwd=SCRIPT_DIR)
        subprocess.run(
            ['git', 'commit', '-m', f"{COMMIT_MESSAGE} {timestamp}"],
            check=True, cwd=SCRIPT_DIR
        )
        subprocess.run(['git', 'push'], check=True, cwd=SCRIPT_DIR)
        print("  -> Push successful. GitHub Action APK build triggered.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error during git push: {e}")
        return False

if __name__ == "__main__":
    print("=" * 52)
    print("  ConsulTime Auto-Push & APK Builder")
    print("  Monitoring for file changes every 15 seconds.")
    print("  Press Ctrl+C to stop.")
    print("=" * 52)

    try:
        while True:
            if has_changes():
                pushed = push_changes()
                if pushed:
                    sync_capacitor()
                    build_apk()
                    # Push the newly built APK to GitHub too
                    if has_changes():
                        subprocess.run(['git', 'add', 'app-debug.apk'], cwd=SCRIPT_DIR)
                        subprocess.run(
                            ['git', 'commit', '-m', f'ci: update app-debug.apk {datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'],
                            cwd=SCRIPT_DIR
                        )
                        subprocess.run(['git', 'push'], cwd=SCRIPT_DIR)
                        print("  -> Latest APK pushed to GitHub repo.")
            time.sleep(CHECK_INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nAuto-Push script stopped.")
