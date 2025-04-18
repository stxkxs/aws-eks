package io.stxkxs.infrastructure.model.eks.addon.managed;

import io.stxkxs.infrastructure.model.eks.ServiceAccountConf;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Map;

@Getter
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ManagedAddon {
  private String configurationValues;
  private String name;
  private boolean preserveOnDelete;
  private String resolveConflicts;
  private ServiceAccountConf serviceAccount;
  private Map<String, String> tags;
  private String version;
}
