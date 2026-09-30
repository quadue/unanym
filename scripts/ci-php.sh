#!/usr/bin/env bash
# The shared, non-root runner has browser libraries but no PHP. Keep the verifier
# in this job's temporary directory; never install packages into the runner.
set -euo pipefail
if command -v php >/dev/null && php -r 'exit(extension_loaded("sodium") ? 0 : 1);'; then
  echo 'Using the installed PHP Sodium verifier.'
  exit 0
fi
. /etc/os-release
if [[ "$ID" != debian || "$VERSION_ID" != 12 ]]; then
  echo 'Install PHP with Sodium on this runner before verification.' >&2
  exit 1
fi
tools_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/unanym-php.XXXXXX")
mkdir -p "$tools_dir/lists/partial" "$tools_dir/cache/archives/partial" "$tools_dir/packages" "$tools_dir/root" "$tools_dir/bin"
apt_options=(-o "Dir::State::lists=$tools_dir/lists" -o "Dir::Cache=$tools_dir/cache" -o "Debug::NoLocking=1")
printf '%s\n' '#clear APT::Update::Post-Invoke;' '#clear APT::Update::Post-Invoke-Success;' > "$tools_dir/apt.conf"
apt_options+=(-c "$tools_dir/apt.conf")
apt-get "${apt_options[@]}" update
cd "$tools_dir/packages"
apt-get "${apt_options[@]}" download php8.2-cli php8.2-common libsodium23
for package in ./*.deb; do dpkg-deb -x "$package" "$tools_dir/root"; done
cat > "$tools_dir/bin/php" <<'PHP'
#!/usr/bin/env bash
set -euo pipefail
php_root="$(cd "$(dirname "$0")/../root" && pwd)"
export LD_LIBRARY_PATH="$php_root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
# Debian's CLI has Sodium built in; loading sodium.so would corrupt JSON output
# with a startup warning even though the built-in verifier is available.
exec "$php_root/usr/bin/php8.2" -n "$@"
PHP
chmod 700 "$tools_dir/bin/php"
"$tools_dir/bin/php" -r 'exit(extension_loaded("sodium") ? 0 : 1);'
if [[ -z "${GITHUB_PATH:-}" ]]; then
  echo "Use this verifier by adding $tools_dir/bin to PATH."
else
  printf '%s\n' "$tools_dir/bin" >> "$GITHUB_PATH"
fi
echo 'Job-local PHP Sodium verifier ready.'
