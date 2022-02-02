/* eslint-disable no-mixed-spaces-and-tabs */
/* eslint-disable no-tabs */
/* eslint-disable no-undef */

import { IInputs } from '../generated/ManifestTypes'

export interface IPcfContextServiceProps{
  selectedValue: ComponentFramework.LookupValue | undefined;
  dependantValue: ComponentFramework.LookupValue | undefined;
  context: ComponentFramework.Context<IInputs>;
  instanceid: string;
  onChange: (selectedOption?: ComponentFramework.LookupValue[] | undefined) => void;
}

export class PcfContextService {
  selectedValue?: ComponentFramework.LookupValue | undefined;
  dependantValue?: ComponentFramework.LookupValue | undefined;
  context: ComponentFramework.Context<IInputs>;

  lookupentityname = ():string => this.context.parameters.lookupfield.getTargetEntityType();
	viewid = ():string => this.context.parameters.lookupfield.getViewId()
  isReadOnly = ():boolean => this.context.mode.isControlDisabled || !this.context.parameters.lookupfield.security?.editable;
  isMasked = ():boolean => !this.context.parameters.lookupfield.security?.readable;
  onChange: (selectedOption?: ComponentFramework.LookupValue[] | undefined) => void;
  showRecordImage = ():boolean => this.context.parameters.showRecordImage.raw === 'true';
  instanceid:string;
  // Dependant lookup
  dependantEntityName = ():string => (this.context.parameters.lookupfield as any).dependentAttributeType ?? ''
  dependantAttribute = ():string => {
    const dependantAttribute = (this.context.parameters.lookupfield as any).dependentAttributeName ?? ''
    const splitted = dependantAttribute.split('.')
    return splitted[splitted.length - 1]
  }

  constructor (props?:IPcfContextServiceProps) {
    if (props) {
      this.context = props.context
      // this.lookupentityname = this.context.parameters.lookupfield.getTargetEntityType()
	    // this.viewid = this.context.parameters.lookupfield.getViewId()
      this.selectedValue = props.selectedValue
      this.dependantValue = props.dependantValue
      this.onChange = props.onChange
      this.instanceid = props.instanceid
    }
  }

  // Returns all strings between curly braces in custom text
  CustomTextAttributes ():string[] {
    // eslint-disable-next-line no-useless-escape
    return this.context.parameters.customtext.raw?.match(/[^{\}]+(?=})/g) ?? []
  }

  SelectText ():string {
    return `--${this.context.parameters.customselecttext.raw ?? 'Select'}--`
  }

  replaceAll (string:string, search:string, replace:string) {
    return string.split(search).join(replace)
  }

  getRecordText (record:ComponentFramework.WebApi.Entity, primaryname:string):string {
    // Default = record primaryname
    if (this.context.parameters.customtext.raw == null) {
      return record[`${primaryname}`]
    } else {
      // Custom text
      let customtext = this.context.parameters.customtext.raw
      this.CustomTextAttributes().forEach(attribute => {
        customtext = this.replaceAll(customtext, `{${attribute}}`, record[`${attribute}`] ?? '')
      })

      return customtext
    }
  }

  // Get the list of fields to fetch
  getAttributes (primaryid:string, primaryname:string, primaryimage:string):string[] {
    const attributes:string[] = [primaryid, primaryname] // primaryid and primaryname is always fetched

    // add custom text attributes if needed
    this.CustomTextAttributes().forEach(attribute => {
      if (!attributes.includes(attribute)) {
        attributes.push(attribute)
      }
    })

    // add primaryimage if needed
    if (this.context.parameters.showRecordImage.raw === 'true') {
      attributes.push(primaryimage)
    }
    return attributes
  }

  async getLookupRecords (primaryid:string, primaryname:string, primaryimage:string, fetchxmldoc:Document) : Promise<ComponentFramework.WebApi.Entity[]> {
    // Manipulate fetch xml to include only the fields we need
    const entityelement = fetchxmldoc.getElementsByTagName('entity')[0]

    // remove existing attributes from view fetchxml
    fetchxmldoc.querySelectorAll('attribute').forEach(el => el.remove())
    fetchxmldoc.querySelectorAll('link-entity[alias="dependant"]').forEach(el => el.remove())

    // add attributes to fetchxml
    this.getAttributes(primaryid, primaryname, primaryimage).forEach(attribute => {
      const customattribute = fetchxmldoc.createElement('attribute')
      customattribute.setAttribute('name', attribute)

      entityelement.appendChild(customattribute)
    })

    // Add dependent filter if needed
    // context.parameters.lookupfield.filterRelationshipName
    // <link-entity name="driv_spaceagency" from="driv_spaceagencyid" to="driv_spaceagency" alias="bb">
	  //   <filter type="and">
    //     <condition attribute="driv_spaceagencyid" operator="eq" uitype="driv_spaceagency" value="c73b716b-a85f-ec11-8f8e-000d3a84327b"/>
	  //   </filter>
	  // </link-entity>

    // linked entity name = this.context.parameters.lookupfield.dependentAttributeType : driv_spaceagency
    // from = GetMetadata + id
    // to = this.context.parameters.lookupfield.dependentAttributeName : driv_spaceflight.driv_spaceagency (get the part from the left)
    // value = id from dependantlookup

    // set dependant filter if needed
    if (this.dependantEntityName() !== '' &&
        this.dependantValue !== undefined &&
        this.dependantValue.id !== '') {
      const linkentity = fetchxmldoc.createElement('link-entity')
      linkentity.setAttribute('name', this.dependantEntityName())
      linkentity.setAttribute('from', `${this.dependantEntityName()}id`)
      linkentity.setAttribute('to', `${this.dependantAttribute()}`)
      linkentity.setAttribute('alias', 'dependant')
      const filter = fetchxmldoc.createElement('filter')
      filter.setAttribute('type', 'and')
      const condition = fetchxmldoc.createElement('condition')
      condition.setAttribute('attribute', `${this.dependantEntityName()}id`)
      condition.setAttribute('operator', 'eq')
      condition.setAttribute('uitype', this.dependantEntityName())
      condition.setAttribute('value', this.dependantValue.id)
      filter.appendChild(condition)
      linkentity.appendChild(filter)
      entityelement.appendChild(linkentity)
    }

    const fetchxmlstring = new XMLSerializer().serializeToString(fetchxmldoc)
    const result = await this.context.webAPI
      .retrieveMultipleRecords(this.lookupentityname(), `?fetchXml=${fetchxmlstring}`)

    return result.entities ?? []
  }

  async getLookupViewFetchXml () : Promise<Document> {
    const result = await this.context.webAPI
      .retrieveRecord('savedquery', this.viewid())
    const parser = new DOMParser()
    const fetchxml = parser.parseFromString(result.fetchxml, 'text/xml')
    return fetchxml
  }

  async getEntityMetadata (entityname:string) : Promise<ComponentFramework.PropertyHelper.EntityMetadata> {
    return this.context.utils.getEntityMetadata(entityname)
  }

  async openRecord ():Promise<ComponentFramework.NavigationApi.OpenFormSuccessResponse> {
    return this.context.navigation.openForm(
      {
        entityName: this.lookupentityname(),
        entityId: this.selectedValue?.id ?? ''
      }
    )
  }
}
