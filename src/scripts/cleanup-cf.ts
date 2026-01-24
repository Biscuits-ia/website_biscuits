if (typeof window !== "undefined") {
  const url = new URL(window.location.href);
  url.searchParams.delete("__cf_chl_rt_tk");
  window.history.replaceState({}, "", url.toString());
}
