package io.stxkxs.infrastructure.model.eks;

import java.util.List;

public record TenancyConf(
  List<Tenant> administrators,
  List<Tenant> users
) {}
