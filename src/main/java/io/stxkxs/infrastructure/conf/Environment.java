package io.stxkxs.infrastructure.conf;

public enum Environment {
  PROTOTYPE, PRODUCTION;

  public static Environment of(Object o) {
    return Environment.valueOf(o.toString().toUpperCase());
  }

  @Override
  public String toString() {
    return name().toLowerCase();
  }
}
