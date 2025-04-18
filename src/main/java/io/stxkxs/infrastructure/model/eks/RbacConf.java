package io.stxkxs.infrastructure.model.eks;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.fabric8.kubernetes.api.model.rbac.ClusterRole;
import io.fabric8.kubernetes.api.model.rbac.ClusterRoleBinding;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RbacConf {
  @JsonProperty("userClusterRoleBinding")
  private ClusterRoleBinding userClusterRoleBinding;

  @JsonProperty("userClusterRole")
  private ClusterRole userClusterRole;
}
