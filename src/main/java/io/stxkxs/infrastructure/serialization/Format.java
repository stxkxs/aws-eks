package io.stxkxs.infrastructure.serialization;

import io.stxkxs.infrastructure.conf.Common;
import org.apache.commons.lang3.StringUtils;
import software.constructs.Construct;

public class Format {
  public static String id(String... s) {
    return String.join(".", s)
      .replace("-", ".");
  }

  public static String name(String... s) {
    return id(s).replace(".", "-");
  }

  public static String describe(Common common, String... s) {
    return String.format("%s %s %s",
      common.organization(), common.environment(),
      StringUtils.join(s, " "));
  }

  public static String exported(Construct scope, String suffix) {
    var prefix = scope.getNode().getContext("host:id").toString();
    var hostedId = scope.getNode().getContext("hosted:id");
    return String.format("%s%s%s", prefix, hostedId, suffix);
  }

  public static String named(Construct scope, String suffix) {
    var prefix = scope.getNode().getContext("host:id").toString();
    var hostedId = scope.getNode().getContext("hosted:id");
    return String.format("%s-%s-%s", prefix, hostedId, suffix);
  }
}
