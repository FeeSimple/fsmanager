import React, { Component } from 'react'
import { connect } from 'react-redux'
import { withRouter } from 'react-router-dom'
import {
  Button,
  Modal,
  ModalBody,
  ModalHeader,
  Collapse,
  Alert
} from 'reactstrap'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import Spinner from 'react-spinkit'
import { stakeUnstakeHalfCpuHalfBw } from '../../../utils/eoshelper'

class StakeModalBody extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      modal: false,
      value: 0,
      isProcessing: false,
      resourceHandleErr: false
    }

    this.toggle = this.toggle.bind(this)
  }

  toggle () {
    this.setState(prevState => ({
      modal: !prevState.modal,
      resourceHandleErr: false
    }))
  }

  handleChangeStart = () => {
    //console.log('Change event started')
  }
  handleChange = value => {
    this.setState({
      value: value
    })
  }
  handleChangeComplete = () => {}

  handleSetStake = async xfsAmount => {
    // Reset state
    this.setState({
      resourceHandleErr: false,
      isProcessing: true
    })

    const { eosClient, accountData, updateAccountInfo } = this.props
    let activeAccount = accountData.active

    let res = await stakeUnstakeHalfCpuHalfBw(
      eosClient,
      activeAccount,
      xfsAmount,
      true
    )

    if (res.errMsg) {
      this.setState({
        resourceHandleErr: res.errMsg,
        isProcessing: false
      })
    } else {
      updateAccountInfo()

      this.setState({
        resourceHandleErr: 'Success',
        isProcessing: false
      })
    }
  }

  render () {
    const { value, resourceHandleErr, isProcessing } = this.state
    const { userBalance, toggle, modal } = this.props
    return (
      <ModalBody className='px-5'>
        <div className='tc'>
          <Collapse isOpen={resourceHandleErr} size='sm'>
            {resourceHandleErr === 'Success' ? (
              <Alert color='success'>
                <div>
                  <div>
                    <b>Transaction successful!</b>
                  </div>
                  <div>Your XFS balance has been updated.</div>
                </div>
              </Alert>
            ) : (
              <Alert color='danger'>{resourceHandleErr}</Alert>
            )}
          </Collapse>
        </div>
        <div className='tc m-b-30'>
          To gain additional resources, adjust the spendable balance (
          <b>{new Intl.NumberFormat().format(userBalance)} XFS</b>) you would
          like to stake:
        </div>

        <h2 className='stackvalueRange'>{value}%</h2>
        {userBalance && (
          <h4 className='stackvalue'>
            {new Intl.NumberFormat().format((value * userBalance) / 100)} XFS
          </h4>
        )}
        <from>
          <div className='form-group row'>
            <div className='col-12'>
              <div className='form-group'>
                <div className='slider'>
                  <Slider
                    min={0}
                    max={100}
                    value={value}
                    onChangeStart={this.handleChangeStart}
                    onChange={this.handleChange}
                    onChangeComplete={this.handleChangeComplete}
                  />
                </div>
              </div>
            </div>
            <div className='col-12'>
              <div className='row'>
                <div className='col-4'>
                  <span className='rangeVal'>0%</span>
                </div>
                <div className='col-4 a-center'>
                  <span className='rangeVal'>50%</span>
                </div>
                <div className='col-4 a-right'>
                  <span className='rangeVal'>100%</span>
                </div>
              </div>
            </div>
          </div>
          <div className='form-group row'>
            <div className='col-12 col-md-6 offset-md-3'>
              <Button
                color='base'
                className='btn prop-btn w100'
                onClick={() => {
                  this.handleSetStake(
                    (parseInt(value) * parseFloat(userBalance)) / 100
                  )
                }}
              >
                {isProcessing ? (
                  <Spinner name='three-bounce' color='white' fadeIn='none' />
                ) : (
                  <span>Stake</span>
                )}
              </Button>
            </div>
          </div>
        </from>
      </ModalBody>
    )
  }
}

function mapStateToProps ({ eosClient, accountData }) {
  return { eosClient, accountData }
}

export default withRouter(connect(mapStateToProps)(StakeModalBody))
