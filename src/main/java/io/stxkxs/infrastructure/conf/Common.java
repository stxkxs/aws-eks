package io.stxkxs.infrastructure.conf;

import lombok.Builder;
import lombok.SneakyThrows;
import org.apache.commons.codec.binary.Base32;
import org.apache.commons.lang3.StringUtils;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

import static java.util.stream.Collectors.toMap;

@Builder(toBuilder = true)
public record Common(
  String id,
  String account,
  String region,
  String organization,
  String name,
  String alias,
  String environment,
  String version,
  String domain,
  Map<String, String> tags
) {
  private static final String ALPHABET = "abcdefghijklmnopqrstuvwxyz";

  @SneakyThrows
  public static String id(String target) {
    var digest = MessageDigest.getInstance("SHA-256");
    var hashBytes = digest.digest(target.getBytes());

    var encodedString = base32Encode(hashBytes);
    encodedString = StringUtils.substring(encodedString, 0, 15);

    if (!Character.isLetter(encodedString.charAt(0))) {
      var replacement = replace(encodedString);
      encodedString = replacement + encodedString.substring(1);
    }

    return encodedString.toLowerCase(Locale.ROOT);
  }

  public static String id_() {
    var LENGTH = 10;
    StringBuilder result = new StringBuilder(LENGTH);
    for (int i = 0; i < LENGTH; i++) {
      int index = new SecureRandom().nextInt(ALPHABET.length());
      result.append(ALPHABET.charAt(index));
    }
    return result.toString();
  }

  private static String base32Encode(byte[] bytes) {
    var base32 = new Base32();
    return base32.encodeAsString(bytes);
  }

  private static char replace(String encodedString) {
    var index = Math.abs(encodedString.hashCode() % ALPHABET.length());
    return ALPHABET.charAt(index);
  }

  public static class Maps {
    public static <K, V> Map<K, V> from(Map<K, V> a, Map<K, V> b, Map<K, V> c) {
      return from(from(a, b), c);
    }

    public static <K, V> Map<K, V> from(Map<K, V> a, Map<K, V> b) {
      if (a == null && b == null) return Collections.emptyMap();
      if (b == null) return a;
      if (a == null) return b;

      return Stream.concat(a.entrySet().stream(), b.entrySet().stream())
        .collect(toMap(Map.Entry::getKey, Map.Entry::getValue, (main, priority) -> priority));
    }
  }
}
