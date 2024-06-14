/*
 * Copyright (c) 2018-2024 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { FormGroup, Slider } from '@patternfly/react-core';
import React from 'react';

const max = 32;
const steps = [
  { value: 0.5, label: '0.5' },
  { value: 2, label: '2', isLabelHidden: true },
  { value: 4, label: '4', isLabelHidden: true },
  { value: 6, label: '6', isLabelHidden: true },
  { value: 8, label: '8' },
  { value: 14, label: '14', isLabelHidden: true },
  { value: 20, label: '20', isLabelHidden: true },
  { value: 26, label: '26', isLabelHidden: true },
  { value: 32, label: '32' },
];

export type Props = {
  onChange: (memoryLimit: number) => void;
  memoryLimit: number;
};
export type State = {
  memoryLimit: number;
};

export class MemoryLimitField extends React.PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      memoryLimit: this.props.memoryLimit,
    };
  }

  public componentDidUpdate(prevProps: Readonly<Props>): void {
    const { memoryLimit } = this.props;
    if (prevProps.memoryLimit !== memoryLimit) {
      this.setState({ memoryLimit });
    }
  }

  private handleChange(memoryLimit: number) {
    if (memoryLimit !== this.state.memoryLimit) {
      this.setState({ memoryLimit });
      this.props.onChange(memoryLimit);
    }
  }

  public render() {
    const memoryLimit = this.state.memoryLimit;

    return (
      <FormGroup label={`Memory Limit: ${memoryLimit}Gi`}>
        <Slider
          data-testid="memory-limit-slider"
          value={memoryLimit}
          onChange={value => this.handleChange(value)}
          max={max}
          customSteps={steps}
          showTicks
        />
      </FormGroup>
    );
  }
}
