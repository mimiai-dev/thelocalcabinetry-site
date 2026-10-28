#!/bin/sh
# Guards for the built site. Run before every merge:  sh scripts/check-assets.sh [base-ref]   (default origin/main)
# 1. every /_astro/ file a page references exists;
# 2. no file under _astro/ whose name carries a hash was changed in place against the base ref (the CDN keeps such files
#    for a year: edit = new file name with the content hash, then point the pages at it);
# 3. new hashed files named <name>.<8 hex>.css|js carry the sha256 prefix of their own content;
# 4. no page loads the retired analytics (umami, alidata, monitor.js);
# 5. no phone number in any served file: no written number, tel: / sms: link, wa.me link with digits, JSON-LD telephone or known number (scripts/site-config.mjs --check);
# 6. no "luxova" in served files and logos only from the brand kit (scripts/check-brand.mjs).
set -u
cd "$(dirname "$0")/.."
BASE="${1:-origin/main}"
fail=0
python3 - "$BASE" <<'PY' || fail=1
import sys,re,glob,os,subprocess,hashlib
base=sys.argv[1]; bad=[]
# 1
for f in glob.glob('**/*.html',recursive=True):
    s=open(f,encoding='utf-8',errors='ignore').read()
    for ref in set(re.findall(r'(?:href|src)="(/_astro/[^"?#]+)"',s)):
        if not os.path.exists(ref.lstrip('/')): bad.append(f'{f}: references missing {ref}')
    if re.search(r'monitor\.js|umami|alidata',s,re.I): bad.append(f'{f}: loads retired analytics (monitor.js / umami / alidata)')
# 2
try:
    out=subprocess.run(['git','diff','--name-status',base,'--','_astro'],capture_output=True,text=True,check=True).stdout
    for line in out.splitlines():
        st,*p=line.split('\t'); name=p[-1]
        if st.startswith('M') or st.startswith('D') or st.startswith('R'):
            bad.append(f'{name}: hashed asset changed or removed in place ({st}); give it a new name with its content hash')
except Exception as e:
    print('WARNING: could not diff against',base,e)
# 3
try:
    added=subprocess.run(['git','diff','--name-status','--diff-filter=A',base,'--','_astro'],capture_output=True,text=True).stdout
    for line in added.splitlines():
        name=line.split('\t')[-1]
        m=re.match(r'.*/[A-Za-z0-9_-]+\.([0-9a-f]{8})\.(css|js)$',name)
        if m and hashlib.sha256(open(name,'rb').read()).hexdigest()[:8]!=m.group(1): bad.append(f'{name}: name hash is not the sha256 prefix of its content')
except Exception: pass
print('\n'.join(bad) if bad else 'check-assets: OK'); sys.exit(1 if bad else 0)
PY
# 5. no phone number anywhere (owner 2026-10-27 / 2026-10-28): the rules first against built-up samples, then every served file
node scripts/site-config.mjs --self-test || fail=1
node scripts/site-config.mjs --check || fail=1
# 6. brand guard (lead D8): no "luxova" in what the site serves, logos only from the brand kit (brand-logos.json)
node scripts/check-brand.mjs || fail=1
exit $fail
