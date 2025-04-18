package io.stxkxs.infrastructure.conf;

public enum Version {
  V1, V2, V3;

  public static Version of(Object o) {
    return Version.valueOf(o.toString().toUpperCase());
  }

  @Override
  public String toString() {
    return name().toLowerCase();
  }
}
