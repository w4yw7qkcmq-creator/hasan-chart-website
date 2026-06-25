export async function adminFetch(url, options = {}) {
  const requestOptions = {
    ...options,
    credentials: "same-origin",
  };

  let response = await fetch(url, requestOptions);

  if (response.status !== 401) {
    return response;
  }

  const refreshResponse = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
  });

  if (!refreshResponse.ok) {
    return response;
  }

  response = await fetch(url, requestOptions);
  return response;
}
