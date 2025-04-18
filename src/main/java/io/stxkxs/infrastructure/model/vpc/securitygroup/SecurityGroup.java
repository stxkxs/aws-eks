package io.stxkxs.infrastructure.model.vpc.securitygroup;

import java.util.List;
import java.util.Map;

public record SecurityGroup(
  String name,
  String description,
  boolean disableInlineRules,
  boolean allowAllOutbound,
  List<SecurityGroupIpRule> ingressRules,
  List<SecurityGroupIpRule> egressRules,
  Map<String, String> tags
) {}
