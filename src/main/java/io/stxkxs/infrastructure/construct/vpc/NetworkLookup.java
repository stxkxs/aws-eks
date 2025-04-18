package io.stxkxs.infrastructure.construct.vpc;

import io.stxkxs.infrastructure.conf.Common;
import lombok.Getter;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awscdk.services.ec2.IVpc;
import software.amazon.awscdk.services.ec2.Vpc;
import software.amazon.awscdk.services.ec2.VpcLookupOptions;
import software.constructs.Construct;

import static io.stxkxs.infrastructure.serialization.Format.id;


@Slf4j
@Getter
public class NetworkLookup extends Construct {
  private final IVpc vpc;

  @SneakyThrows
  public NetworkLookup(Construct scope, Common common, String name) {
    super(scope, id("network.lookup", name));

    if ("true".equals(scope.getNode().tryGetContext("init"))) {
      log.debug("executing cdk synth ... --context init ... to validate stack without vpc lookup!");
      this.vpc = Vpc.Builder.create(scope, "init").build();
      return;
    }

    this.vpc = Vpc.fromLookup(
      scope, "vpc.lookup",
      VpcLookupOptions.builder()
        .ownerAccountId(common.account())
        .region(common.region())
        .vpcName(name)
        .isDefault(false)
        .build());
  }
}
