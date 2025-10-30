cat > .gitignore <<'EOF'
# dependencies & builds
node_modules/
.next/
out/
dist/
coverage/
*.log

# env & local config
.env
.env.local
.vercel/

# editors & OS
.DS_Store
.idea/
.vscode/
EOF
