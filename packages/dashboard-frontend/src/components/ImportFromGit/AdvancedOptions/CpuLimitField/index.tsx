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

const steps = [
  { value: 0.2, label: '0.2' },
  { value: 0.5, label: '1', isLabelHidden: true },
  { value: 1, label: '2', isLabelHidden: true },
  { value: 1.5, label: '3', isLabelHidden: true },
  { value: 2, label: '2' },
  { value: 3.5, label: '3.5', isLabelHidden: true },
  { value: 5, label: '5', isLabelHidden: true },
  { value: 6.5, label: '6.5', isLabelHidden: true },
  { value: 8, label: '8' },
];

export type Props = {
  onChange: (cpuLimit: number) => void;
  cpuLimit: number;
};
export type State = {
  cpuLimit: number;
};

export class CpuLimitField extends React.PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      cpuLimit: this.props.cpuLimit,
    };
  }

  public componentDidUpdate(prevProps: Readonly<Props>): void {
    const { cpuLimit } = this.props;
    if (prevProps.cpuLimit !== cpuLimit) {
      this.setState({ cpuLimit });
    }
  }

  private handleChange(cpuLimit: number) {
    if (cpuLimit !== this.state.cpuLimit) {
      this.setState({ cpuLimit });
      this.props.onChange(cpuLimit);
    }
  }

  public render() {
    const cpuLimit = this.state.cpuLimit;
    const max = steps[steps.length - 1].value;

    return (
      <FormGroup label={`CPU Limit: ${cpuLimit}Gi`}>
        <Slider
          data-testid="cpu-limit-slider"
          value={cpuLimit}
          onChange={value => this.handleChange(value)}
          max={max}
          customSteps={steps}
          showTicks
        />
      </FormGroup>
    );
  }
}
