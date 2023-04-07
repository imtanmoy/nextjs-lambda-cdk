export const isValidDomain = (domain: string) => {
  var re = new RegExp(
    /^((?:(?:(?:\w[\.\-\+]?)*)\w)+)((?:(?:(?:\w[\.\-\+]?){0,62})\w)+)\.(\w{2,6})$/
  );
  return re.test(domain);
};

export const isSubdomain = (domain: string) => {
  return domain.split(".").length > 2;
};

export const getSubdomain = (domain: string) => {
  return domain.split(".").slice(0, -2).join(".");
};

export const getDomain = (domain: string) => {
  return domain.split(".").slice(-2).join(".");
};

export const getDomains = (domain: string) => {
  if (!isValidDomain(domain)) {
    throw new Error("Invalid domain");
  }
  return isSubdomain(domain) ? [domain] : [domain, `www.${domain}`];
};
