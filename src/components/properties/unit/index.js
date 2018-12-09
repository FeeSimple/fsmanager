import React, { Component } from 'react'
import { connect } from 'react-redux'
import { withRouter } from 'react-router-dom'
import Table from './Table'
import { UNIT, FSMGRCONTRACT } from '../../../utils/consts'
import { addUnits } from '../../../actions/index'


class UnitContainer extends Component {
  async componentDidMount () {
    const { eosClient, accountData, addUnits } = this.props

    const { rows } = await eosClient.getTableRows(
      true,
      FSMGRCONTRACT,
      accountData.active,
      UNIT
    )
    addUnits(rows)
  }

  render() {
    const { properties } = this.props
    const { id } = this.props.match.params
    const property = properties[id]
    return (
      <Table propertyId={property.id} property={property}/>
    )
  }
}

function mapStateToProps({ properties, eosClient, scatter, contracts, accountData }){
  return { properties, eosClient, scatter, contracts, accountData }
}

export default withRouter(connect(
  mapStateToProps,
  { addUnits }
)(UnitContainer))