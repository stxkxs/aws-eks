package io.stxkxs.infrastructure.stack;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.construct.vpc.VpcConstruct;
import io.stxkxs.infrastructure.model.vpc.NetworkConf;
import lombok.Getter;
import software.amazon.awscdk.CfnOutput;
import software.amazon.awscdk.NestedStack;
import software.amazon.awscdk.NestedStackProps;
import software.amazon.awscdk.services.ec2.Vpc;
import software.constructs.Construct;

import static io.stxkxs.infrastructure.serialization.Format.*;


@Getter
public class Network extends NestedStack {
  private final Vpc vpc;

  public Network(Construct scope, Common common, NetworkConf conf, NestedStackProps props) {
    super(scope, "network", props);

    this.vpc = new VpcConstruct(this, common, conf).vpc();

    CfnOutput.Builder
      .create(this, id(common.id(), "vpc.id"))
      .exportName(exported(scope, "vpcid"))
      .value(this.vpc().getVpcId())
      .description(describe(common))
      .build();
  }
}
