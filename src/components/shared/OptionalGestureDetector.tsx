import React from "react";
import { GestureDetector } from "react-native-gesture-handler";

/**
 * GestureDetector crashes with `toGestureArray of undefined` when `gesture`
 * is missing. Custom DraggableCard handles are optional until cloneElement
 * injects the pan gesture.
 */
export function OptionalGestureDetector({
  gesture,
  children,
}: {
  gesture?: object;
  children: React.ReactElement;
}): React.ReactElement {
  if (!gesture) {
    return children;
  }
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
