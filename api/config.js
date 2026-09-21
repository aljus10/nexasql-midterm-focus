export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let rawUrl = (process.env.SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
  let rawKey = (process.env.SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');

  // Auto-detect if SUPABASE_URL and SUPABASE_ANON_KEY were accidentally swapped
  if (rawUrl.includes('eyJ') || (rawKey.includes('.supabase.co') && !rawUrl.includes('.supabase.co'))) {
    const temp = rawUrl;
    rawUrl = rawKey;
    rawKey = temp;
  }

  let supabaseUrl = rawUrl;
  try {
    if (supabaseUrl) {
      const parsed = new URL(supabaseUrl.startsWith('http') ? supabaseUrl : 'https://' + supabaseUrl);
      supabaseUrl = parsed.origin;
    }
  } catch (_) {}

  const supabaseAnonKey = rawKey.replace(/^https?:\/\//, '');

  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey
  });
}
