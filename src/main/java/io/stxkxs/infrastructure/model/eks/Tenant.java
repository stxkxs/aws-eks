package io.stxkxs.infrastructure.model.eks;

public record Tenant(
  String email,
  String role,
  String username
) {}
