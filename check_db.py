import psycopg2

conn = psycopg2.connect('postgresql://postgres.vbllagoyotlrxsdmnyxu:comsats0099@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor()

# Check social_accounts for this workspace
cur.execute("""
    SELECT platform, account_name, is_connected, page_id, page_name, expires_at 
    FROM social_accounts 
    WHERE workspace_id = '72f4e5fd-00dc-415a-ac82-c58cba21d05b'
""")

rows = cur.fetchall()
print("=" * 60)
for row in rows:
    print(f"Platform: {row[0]}")
    print(f"  account_name: {row[1]}")
    print(f"  is_connected: {row[2]}")
    print(f"  page_id: {row[3]}")
    print(f"  page_name: {row[4]}")
    print(f"  expires_at: {row[5]}")
    print("-" * 40)

if not rows:
    print("NO RECORDS FOUND!")
print("=" * 60)
conn.close()
