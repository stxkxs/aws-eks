package io.stxkxs.infrastructure.conf;

public record Hosted<T>(
  Host host,
  T hosted
) {}
