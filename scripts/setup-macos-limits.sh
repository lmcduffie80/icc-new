#!/bin/bash
# Set up permanent file descriptor limits on macOS

echo "Setting up permanent file descriptor limits..."
echo "This requires sudo access."

# Create limit.maxfiles.plist
sudo tee /Library/LaunchDaemons/limit.maxfiles.plist > /dev/null <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
        "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>limit.maxfiles</string>
    <key>ProgramArguments</key>
    <array>
      <string>launchctl</string>
      <string>limit</string>
      <string>maxfiles</string>
      <string>65536</string>
      <string>200000</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>ServiceIPC</key>
    <false/>
  </dict>
</plist>
EOF

# Set correct permissions
sudo chown root:wheel /Library/LaunchDaemons/limit.maxfiles.plist
sudo chmod 644 /Library/LaunchDaemons/limit.maxfiles.plist

# Load the configuration
sudo launchctl load -w /Library/LaunchDaemons/limit.maxfiles.plist

# Apply limits immediately
sudo launchctl limit maxfiles 65536 200000

echo ""
echo "File descriptor limits have been increased permanently!"
echo "Please restart your terminal or computer for changes to fully take effect."
echo ""
echo "To verify, run: launchctl limit maxfiles"
