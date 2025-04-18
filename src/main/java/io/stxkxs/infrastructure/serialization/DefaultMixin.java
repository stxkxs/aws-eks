package io.stxkxs.infrastructure.serialization;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonInclude.Include;

@JsonInclude(Include.NON_EMPTY)
public class DefaultMixin {

  @Override
  @JsonIgnore
  public int hashCode() {
    return super.hashCode();
  }

  @Override
  @JsonIgnore
  public boolean equals(Object obj) {
    return super.equals(obj);
  }

  @Override
  @JsonIgnore
  protected Object clone() throws CloneNotSupportedException {
    return super.clone();
  }

  @Override
  @JsonIgnore
  public String toString() {
    return super.toString();
  }
}
