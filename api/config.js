module.exports = (req, res) => {
  const publicKey = (
    process.env.FLUTTERWAVE_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY ||
    process.env.PUBLIC_KEY_FLUTTERWAVE ||
    ''
  ).trim();

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json({
    success: true,
    flutterwavePublicKey: publicKey
  });
};
