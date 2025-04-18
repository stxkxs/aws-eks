package io.stxkxs.infrastructure.stack;

import io.stxkxs.infrastructure.conf.Platform;
import lombok.Getter;
import software.amazon.awscdk.NestedStackProps;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.constructs.Construct;

import static io.stxkxs.infrastructure.serialization.Format.describe;

@Getter
public class EksPlatform extends Stack {
  private final Network network;
  private final Eks eks;

  public EksPlatform(Construct scope, Platform conf, StackProps props) {
    super(scope, "eks.platform", props);

    this.network = new Network(this, conf.common(), conf.vpc(),
      NestedStackProps.builder()
        .description(describe(conf.common(), "eks::network"))
        .build());

    this.eks = new Eks(this, conf, this.network().vpc(),
      NestedStackProps.builder()
        .description(describe(conf.common(), "eks::cluster"))
        .build());
  }
}
