/** Angular Imports */
import { Component, OnInit, TemplateRef, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { UntypedFormGroup, UntypedFormBuilder, Validators, UntypedFormArray } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

/** Custom Services */
import { AccountingService } from '../accounting.service';
import { SettingsService } from 'app/settings/settings.service';
import { PopoverService } from '../../configuration-wizard/popover/popover.service';
import { ConfigurationWizardService } from '../../configuration-wizard/configuration-wizard.service';

/** Custom Validators */
import { onlyOneOfTheFieldsIsRequiredValidator } from './only-one-of-the-fields-is-required.validator';
import { Dates } from 'app/core/utils/dates';
import { TranslateService } from '@ngx-translate/core';

/**
 * Migrate opening balances component.
 */
@Component({
  selector: 'mifosx-migrate-opening-balances',
  templateUrl: './migrate-opening-balances.component.html',
  styleUrls: ['./migrate-opening-balances.component.scss']
})
export class MigrateOpeningBalancesComponent implements OnInit, AfterViewInit {

  /** Minimum opening balances date allowed. */
  minDate = new Date(2000, 0, 1);
  /** Maximum opening balances date allowed. */
  maxDate = new Date();
  /** Opening balances form. */
  openingBalancesForm: UntypedFormGroup;
  /** Opening balances data. */
  openingBalancesData: any;
  /** Office data. */
  officeData: any;
  /** Currency data. */
  currencyData: any;
  currencyCode: string;
  /** Sum total of debits. */
  debitsSum = 0;
  /** Sum total of credits. */
  creditsSum = 0;
  exchangeRate: number = 1;

  /* Reference of search form */
  @ViewChild('searchFormRef') searchFormRef: ElementRef<any>;
  /* Template for popover on search form */
  @ViewChild('templateSearchFormRef') templateSearchFormRef: TemplateRef<any>;

  /**
   * Retrieves the offices and currencies from `resolve`.
   * @param {FormBuilder} formBuilder Form Builder.
   * @param {AccountingService} accountingService Accounting Service.
   * @param {SettingsService} settingsService Settings Service.
   * @param {ActivatedRoute} route Activated Route.
   * @param {Router} router Router for navigation.
   * @param {ConfigurationWizardService} configurationWizardService ConfigurationWizard Service.
   * @param {PopoverService} popoverService PopoverService.
   */
  constructor(private formBuilder: UntypedFormBuilder,
    private accountingService: AccountingService,
    private settingsService: SettingsService,
    private dateUtils: Dates,
    private route: ActivatedRoute,
    private router: Router,
    private configurationWizardService: ConfigurationWizardService,
    private popoverService: PopoverService,
    private translateService: TranslateService) {
    this.route.data.subscribe((data: {
      offices: any,
      currencies: any
    }) => {
      this.officeData = data.offices;
      this.currencyData = data.currencies.selectedCurrencyOptions;
    });
  }

  /**
   * Creates the opening balances form. (initially retrieves gl accounts on the basis of specified office)
   */
  ngOnInit() {
    this.maxDate = this.settingsService.businessDate;
    this.createOpeningBalancesForm();
  }

  /**
   * Creates the opening balances form.
   */
  createOpeningBalancesForm() {
    this.openingBalancesForm = this.formBuilder.group({
      'officeId': ['', Validators.required],
      'currencyCode': ['', Validators.required],
      'transactionDate': ['', Validators.required],
      'exchangeRate': [],
      'glAccountEntries': this.formBuilder.array([])
    });

    this.openingBalancesForm.controls.currencyCode.valueChanges.subscribe((value: string) => {
      this.currencyCode = value;
      if (value === 'UGX') {
        this.openingBalancesForm.patchValue({ exchangeRate: 1 });
        this.openingBalancesForm.get('exchangeRate').disable();
      } else {
        this.openingBalancesForm.get('exchangeRate').enable();
      }
    });
  }

  /**
   * Creates the gl account entry form.
   * @param glAccount GL Account for which form is returned.
   * @returns {FormGroup} GL Account entry form.
   */
  createGLAccountEntryForm(glAccount: any): UntypedFormGroup {
    return this.formBuilder.group({
      'glAccountId': [glAccount.glAccountId],
      'debit': [null],
      'credit': [null]
    }, { validator: onlyOneOfTheFieldsIsRequiredValidator });
  }

  /**
   * Gets the gl account entries form array.
   * @returns {FormArray} GL Account entries form array.
   */
  get glAccountEntries(): UntypedFormArray {
    return this.openingBalancesForm.get('glAccountEntries') as UntypedFormArray;
  }

  /**
   * Retrieves gl accounts on the basis of specified office.
   */
  retrieveOpeningBalances() {
    this.accountingService.retrieveOpeningBalances(this.openingBalancesForm.value.officeId)
      .subscribe((openingBalancesData: any) => {
        const entry = this.openingBalancesForm.get('glAccountEntries') as UntypedFormArray;

        openingBalancesData.glAccounts = openingBalancesData.assetAccountOpeningBalances
          .concat(openingBalancesData.liabityAccountOpeningBalances,
            openingBalancesData.equityAccountOpeningBalances,
            openingBalancesData.incomeAccountOpeningBalances,
            openingBalancesData.expenseAccountOpeningBalances);

        openingBalancesData.glAccounts.forEach((glAccount: any) => {
          entry.push(this.createGLAccountEntryForm(glAccount));
        });

        this.openingBalancesData = openingBalancesData;

        entry.valueChanges.subscribe(() => {
          this.debitsSum = 0;
          this.creditsSum = 0;
          entry.controls.forEach(value => {
            this.debitsSum += value.value.debit;
            this.creditsSum += value.value.credit;
          });
        });
      });
  }

  /**
   * Checks if all amounts are valid.
   */
  amountsAreOK(): boolean {
    // Add null check for glAccountEntries
    const entries = this.openingBalancesForm.value.glAccountEntries || [];
    let creditsSum = 0;
    let debitsSum = 0;
    
    entries.forEach((entry: any) => {
      if (entry.credit) {
        creditsSum += parseFloat(entry.credit);
      }
      if (entry.debit) {
        debitsSum += parseFloat(entry.debit);
      }
    });

    return creditsSum === debitsSum;
  }

  /**
   * Submits the opening balances form and defines opening balances,
   * if successful redirects to view created transaction.
   */
  submit() {
    if (this.amountsAreOK()) {
      const openingBalances = this.openingBalancesForm.value;
      openingBalances.locale = this.settingsService.language.code;
      openingBalances.dateFormat = this.settingsService.dateFormat;
      
      if (openingBalances.transactionDate instanceof Date) {
        openingBalances.transactionDate = this.dateUtils.formatDate(openingBalances.transactionDate, this.settingsService.dateFormat);
      }
      
      // Initialize arrays even if no entries exist
      openingBalances.debits = [];
      openingBalances.credits = [];
      const exchangeRate = this.openingBalancesForm.get('exchangeRate')?.value || 1;

      // Add null check for glAccountEntries
      const entries = openingBalances.glAccountEntries || [];
      entries.forEach((entry: any) => {
        if (entry.debit) {
          openingBalances.debits.push({
            glAccountId: entry.glAccountId,
            amount: entry.debit * exchangeRate
          });
        }
        if (entry.credit) {
          openingBalances.credits.push({
            glAccountId: entry.glAccountId,
            amount: entry.credit * exchangeRate
          });
        }
      });

      delete openingBalances.glAccountEntries;
      
      this.accountingService.defineOpeningBalances(openingBalances).subscribe((response: any) => {
        this.router.navigate(['/accounting/journal-entries/transactions/view', response.transactionId]);
      });
    }
  }

  /**
   * Popover function
   * @param template TemplateRef<any>.
   * @param target HTMLElement | ElementRef<any>.
   * @param position String.
   * @param backdrop Boolean.
   */
  showPopover(template: TemplateRef<any>, target: HTMLElement | ElementRef<any>, position: string, backdrop: boolean): void {
    setTimeout(() => this.popoverService.open(template, target, position, backdrop, {}), 200);
  }

  /**
   * To show popover.
   */
  ngAfterViewInit() {
    if (this.configurationWizardService.showMigrateOpeningBalances === true) {
      setTimeout(() => {
        this.showPopover(this.templateSearchFormRef, this.searchFormRef.nativeElement, 'bottom', true);
      });
    }
  }

  /**
   * Next Step (Closing Entries Accounting Page) Configuration Wizard.
   */
  nextStep() {
    this.configurationWizardService.showMigrateOpeningBalances = false;
    this.configurationWizardService.showClosingEntries = true;
    this.router.navigate(['/accounting']);
  }

  /**
   * Previous Step (Migrate Opening Balances Accounting Page) Configuration Wizard.
   */
  previousStep() {
    this.router.navigate(['/accounting']);
  }

  glAccountTypeLabel(accountType: string): string {
    return this.translateService.instant('labels.inputs.accounting.' + accountType);
  }

}
