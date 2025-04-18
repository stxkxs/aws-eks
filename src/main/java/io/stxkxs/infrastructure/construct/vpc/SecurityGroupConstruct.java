package io.stxkxs.infrastructure.construct.vpc;

import io.stxkxs.infrastructure.conf.Common;
import io.stxkxs.infrastructure.model.vpc.securitygroup.SecurityGroup;
import lombok.Getter;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.ec2.Peer;
import software.amazon.awscdk.services.ec2.Port;
import software.amazon.awscdk.services.ec2.Vpc;
import software.constructs.Construct;

import static io.stxkxs.infrastructure.serialization.Format.id;

@Getter
public class SecurityGroupConstruct extends Construct {
  private final software.amazon.awscdk.services.ec2.SecurityGroup securityGroup;

  public SecurityGroupConstruct(Construct scope, Common common, SecurityGroup conf, Vpc vpc) {
    super(scope, id("security-group", conf.name()));

    this.securityGroup = software.amazon.awscdk.services.ec2.SecurityGroup.Builder
      .create(this, conf.name())
      .vpc(vpc)
      .securityGroupName(conf.name())
      .description(conf.description())
      .disableInlineRules(conf.disableInlineRules())
      .allowAllOutbound(conf.allowAllOutbound())
      .build();

    conf.ingressRules()
      .forEach(rule -> this.securityGroup().addIngressRule(Peer.ipv4(rule.ip()), Port.tcpRange(rule.startPort(), rule.endPort())));

    conf.egressRules()
      .forEach(rule -> this.securityGroup().addEgressRule(Peer.ipv4(rule.ip()), Port.tcpRange(rule.startPort(), rule.endPort())));

    Common.Maps.from(common.tags(), conf.tags())
      .forEach((key, value) -> Tags.of(this.securityGroup()).add(key, value));
  }
}
