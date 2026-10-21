export function googleOAuthClient(connection = {}, readSecret, environment = process.env) {
  const bound = connection.googleOAuthClientKey ? readSecret('google-oauth-client:' + connection.googleOAuthClientKey) : {};
  if (connection.googleOAuthClientKey && (!bound.clientId || !bound.clientSecret)) throw new Error('Chưa cấu hình ứng dụng Google riêng cho kênh này.');
  return {clientId: bound.clientId || environment.GOOGLE_CLIENT_ID || '', clientSecret: bound.clientSecret || environment.GOOGLE_CLIENT_SECRET || ''};
}

export function googleRefreshClient(tokens = {}, environment = process.env) {
  if (tokens.googleClientId || tokens.googleClientSecret) {
    if (!tokens.googleClientId || !tokens.googleClientSecret) throw new Error('Thiếu thông tin ứng dụng Google của phiên kết nối. Hãy kết nối lại.');
    return {clientId: tokens.googleClientId, clientSecret: tokens.googleClientSecret};
  }
  return {clientId: environment.GOOGLE_CLIENT_ID || '', clientSecret: environment.GOOGLE_CLIENT_SECRET || ''};
}
