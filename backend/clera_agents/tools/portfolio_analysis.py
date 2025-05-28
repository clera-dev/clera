"""
Portfolio analysis tools for classifying securities and analyzing portfolios.
"""

from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from decimal import Decimal

from clera_agents.types.portfolio_types import (
    AssetClass, SecurityType, TargetPortfolio
)


@dataclass
class PortfolioPosition:
    """Represents a position in a portfolio with normalized fields."""
    symbol: str
    quantity: Decimal  # Number of shares (for reference only)
    current_price: Decimal  # Price per share (for reference only)
    market_value: Decimal  # The notional (dollar) value of the position - use this for trading
    cost_basis: Optional[Decimal] = None  # Total cost in dollars
    unrealized_pl: Optional[Decimal] = None  # Profit/loss in dollars
    unrealized_plpc: Optional[Decimal] = None  # Profit/loss percentage
    
    # Classification fields
    asset_class: Optional[AssetClass] = None
    security_type: Optional[SecurityType] = None
    
    @classmethod
    def from_alpaca_position(cls, position) -> 'PortfolioPosition':
        """Create a PortfolioPosition from an Alpaca Position object."""
        return cls(
            symbol=position.symbol,
            quantity=Decimal(position.qty),  # Share quantity (for reference)
            current_price=Decimal(position.current_price),  # Per share price (for reference)
            market_value=Decimal(position.market_value),  # This is the notional (dollar) value for trading
            cost_basis=Decimal(position.cost_basis) if hasattr(position, 'cost_basis') else None,
            unrealized_pl=Decimal(position.unrealized_pl) if hasattr(position, 'unrealized_pl') else None,
            unrealized_plpc=Decimal(position.unrealized_plpc) if hasattr(position, 'unrealized_plpc') else None,
            # We'll apply classification in a separate step
            asset_class=None,
            security_type=None
        )


class PortfolioAnalyzer:
    """Analyzes portfolio positions against target allocations."""
    
    # Common ETF symbols
    COMMON_ETFS = {
        # US Broad Market
        'SPY': 'S&P 500 ETF',
        'VOO': 'Vanguard S&P 500 ETF',
        'IVV': 'iShares Core S&P 500 ETF',
        'VTI': 'Vanguard Total Stock Market ETF',
        'QQQ': 'Invesco QQQ (Nasdaq 100) ETF',
        
        # International
        'VXUS': 'Vanguard Total International Stock ETF',
        'EFA': 'iShares MSCI EAFE ETF',
        'VEA': 'Vanguard Developed Markets ETF',
        'EEM': 'iShares MSCI Emerging Markets ETF',
        'VWO': 'Vanguard Emerging Markets ETF',
        
        # Fixed Income
        'AGG': 'iShares Core U.S. Aggregate Bond ETF',
        'BND': 'Vanguard Total Bond Market ETF',
        'VCIT': 'Vanguard Intermediate-Term Corporate Bond ETF',
        'MUB': 'iShares National Muni Bond ETF',
        'TIP': 'iShares TIPS Bond ETF',
        'VTIP': 'Vanguard Short-Term Inflation-Protected Securities ETF',
        
        # Real Estate
        'VNQ': 'Vanguard Real Estate ETF',
        'SCHH': 'Schwab U.S. REIT ETF',
        'IYR': 'iShares U.S. Real Estate ETF',
        
        # Commodities
        'GLD': 'SPDR Gold Shares',
        'IAU': 'iShares Gold Trust',
        'SLV': 'iShares Silver Trust',
        'USO': 'United States Oil Fund',
        
        # Sector Specific
        'XLF': 'Financial Select Sector SPDR Fund',
        'XLK': 'Technology Select Sector SPDR Fund',
        'XLV': 'Health Care Select Sector SPDR Fund',
        'XLE': 'Energy Select Sector SPDR Fund',
    }
    
    @classmethod
    def classify_position(cls, position: PortfolioPosition) -> PortfolioPosition:
        """Classify a position by asset class and security type."""
        # Strategy 1: Check if symbol is in our known ETF list
        if position.symbol in cls.COMMON_ETFS:
            position.security_type = SecurityType.ETF
            
            # Rough asset class classification
            if position.symbol in ('AGG', 'BND', 'VCIT', 'MUB', 'TIP', 'VTIP'):
                position.asset_class = AssetClass.FIXED_INCOME
            elif position.symbol in ('VNQ', 'SCHH', 'IYR'):
                position.asset_class = AssetClass.REAL_ESTATE
            elif position.symbol in ('GLD', 'IAU', 'SLV', 'USO'):
                position.asset_class = AssetClass.COMMODITIES
            else:
                position.asset_class = AssetClass.EQUITY
        else:
            # Strategy 2: Check if we can identify ETF by name from asset cache
            # (since ALL ETFs on Alpaca have "ETF" in their name)
            is_etf_by_name = False
            try:
                import os
                import json
                
                # Try to read asset details from the cached assets file
                asset_cache_file = os.path.join(os.path.dirname(__file__), "..", "..", "data", "tradable_assets.json")
                if os.path.exists(asset_cache_file):
                    with open(asset_cache_file, 'r') as f:
                        cached_assets = json.load(f)
                        cached_asset = next((asset for asset in cached_assets if asset.get('symbol') == position.symbol), None)
                        if cached_asset and cached_asset.get('name'):
                            asset_name_lower = cached_asset['name'].lower()
                            if 'etf' in asset_name_lower:
                                is_etf_by_name = True
            except Exception:
                # Silently continue if asset cache is not available
                pass
            
            if is_etf_by_name:
                position.security_type = SecurityType.ETF
                position.asset_class = AssetClass.EQUITY  # Default to equity for unknown ETFs
            else:
                # Assume individual stock for now - could be enhanced
                position.security_type = SecurityType.INDIVIDUAL_STOCK
                position.asset_class = AssetClass.EQUITY
            
        return position
    
    @classmethod
    def analyze_portfolio(cls, positions: List[PortfolioPosition]) -> Dict:
        """Analyze a portfolio of positions and return summary statistics."""
        # Classify positions if not already classified
        for i, position in enumerate(positions):
            if position.asset_class is None or position.security_type is None:
                positions[i] = cls.classify_position(position)
        
        # Calculate total value
        total_value = sum(position.market_value for position in positions)
        
        # Calculate asset class breakdown
        asset_class_values = {}
        for asset_class in AssetClass:
            asset_class_values[asset_class] = Decimal('0')
            
        for position in positions:
            if position.asset_class:
                asset_class_values[position.asset_class] += position.market_value
        
        asset_class_percentages = {
            asset_class: (value / total_value * 100 if total_value > 0 else 0)
            for asset_class, value in asset_class_values.items()
        }
        
        # Calculate security type breakdown
        security_type_values = {}
        for security_type in SecurityType:
            security_type_values[security_type] = Decimal('0')
            
        for position in positions:
            if position.security_type:
                security_type_values[position.security_type] += position.market_value
        
        security_type_percentages = {
            security_type: (value / total_value * 100 if total_value > 0 else 0)
            for security_type, value in security_type_values.items()
        }
        
        # Calculate SPY equivalent allocation (for determining if portfolio follows the 50/50 strategy)
        spy_equivalents = ('SPY', 'VOO', 'IVV')  # S&P 500 ETFs
        spy_equivalent_value = sum(
            position.market_value 
            for position in positions 
            if position.symbol in spy_equivalents
        )
        
        return {
            'total_value': total_value,
            'asset_class_values': asset_class_values,
            'asset_class_percentages': asset_class_percentages,
            'security_type_values': security_type_values,
            'security_type_percentages': security_type_percentages,
            'etf_percentage': security_type_percentages.get(SecurityType.ETF, 0),
            'individual_stock_percentage': security_type_percentages.get(SecurityType.INDIVIDUAL_STOCK, 0),
            'spy_equivalent_value': spy_equivalent_value,
            'spy_equivalent_percentage': (spy_equivalent_value / total_value * 100 if total_value > 0 else 0),
        }
    
    @classmethod
    def generate_rebalance_instructions(
        cls, 
        positions: List[PortfolioPosition], 
        target_portfolio: TargetPortfolio
    ) -> str:
        """Generate rebalancing instructions based on current positions and target portfolio."""
        # First convert alpaca positions to our standard format
        converted_positions = positions
        
        # Analyze the portfolio
        analysis = cls.analyze_portfolio(converted_positions)
        
        # Build rebalancing instructions
        instructions = []
        
        # Add portfolio summary
        instructions.append(f"Current Portfolio Summary:")
        instructions.append(f"Total Portfolio Value: ${analysis['total_value']:,.2f}")
        
        # Add asset class breakdown
        instructions.append("\nCurrent Asset Allocation:")
        for asset_class, percentage in analysis['asset_class_percentages'].items():
            if percentage > 0:
                # Format asset class name: replace underscores with spaces, then title case
                asset_class_name = asset_class.value.replace('_', ' ').title()
                instructions.append(f"  {asset_class_name}: ${analysis['asset_class_values'][asset_class]:,.2f} ({float(percentage):.1f}%)")
        
        # Add security type breakdown
        instructions.append("\nCurrent Security Type Allocation:")
        for security_type, percentage in analysis['security_type_percentages'].items():
            if percentage > 0:
                instructions.append(f"  {security_type.value.replace('_', ' ').title()}: {float(percentage):.1f}%")
        
        instructions.append("\nTarget Allocation:")
        for asset_class, allocation in target_portfolio.asset_allocations.items():
            # Format asset class name: replace underscores with spaces, then title case
            asset_class_name = asset_class.value.replace('_', ' ').title()
            instructions.append(f"  {asset_class_name}: {allocation.percentage:.1f}%")
            if allocation.security_allocations:
                for security_type, sec_percentage in allocation.security_allocations.items():
                    instructions.append(f"    - {security_type.value.replace('_', ' ').title()}: {sec_percentage:.1f}% of {asset_class_name}")
        
        instructions.append("\nRebalancing Instructions:")
        
        # Calculate rebalancing for asset classes
        for asset_class, target_allocation in target_portfolio.asset_allocations.items():
            current_percentage = float(analysis['asset_class_percentages'].get(asset_class, 0))
            target_percentage = float(target_allocation.percentage)
            
            current_value = analysis['asset_class_values'].get(asset_class, Decimal('0'))
            target_value = analysis['total_value'] * (Decimal(str(target_percentage)) / Decimal('100'))
            
            difference = target_value - current_value
            
            # Only suggest changes above a threshold
            if abs(difference) > Decimal('50'):  # $50 threshold
                action = "Add to" if difference > 0 else "Reduce"
                # Format asset class name: replace underscores with spaces, then title case
                asset_class_name = asset_class.value.replace('_', ' ').title()
                instructions.append(f"  {action} {asset_class_name}: ${abs(difference):,.2f} " +
                                    f"(from {current_percentage:.1f}% to {target_percentage:.1f}%)")
        
        # Handle asset classes that should be reduced to 0%
        for asset_class, percentage in analysis['asset_class_percentages'].items():
            if percentage > 0 and asset_class not in target_portfolio.asset_allocations:
                # This asset class exists in current portfolio but not in target
                current_value = analysis['asset_class_values'][asset_class]
                if current_value > Decimal('50'):  # $50 threshold
                    # Format asset class name: replace underscores with spaces, then title case
                    asset_class_name = asset_class.value.replace('_', ' ').title()
                    instructions.append(f"  Reduce {asset_class_name}: ${current_value:,.2f} " +
                                       f"(from {float(percentage):.1f}% to 0.0%)")
        
        # Specific ETF allocation instructions
        target_etf_percentage = float(target_portfolio.get_etf_allocation())
        current_etf_percentage = float(analysis['etf_percentage'])
        
        if abs(target_etf_percentage - current_etf_percentage) > 1:  # 1% threshold
            target_etf_value = analysis['total_value'] * (Decimal(str(target_etf_percentage)) / Decimal('100'))
            current_etf_value = analysis['total_value'] * (Decimal(str(current_etf_percentage)) / Decimal('100'))
            difference = target_etf_value - current_etf_value
            
            action = "Add to" if difference > 0 else "Reduce"
            instructions.append(f"  {action} ETFs: ${abs(difference):,.2f} " +
                                f"(from {current_etf_percentage:.1f}% to {target_etf_percentage:.1f}%)")
            
            # Specifics for SPY if it's a significant part of the ETF allocation
            if target_etf_percentage > 10:  # If ETFs are at least 10% of the portfolio
                instructions.append(f"    - Consider using SPY or VOO (S&P 500 ETFs) for broad market exposure")
        
        # Specific individual stock allocation instructions
        target_stock_percentage = float(target_portfolio.get_individual_stocks_allocation())
        current_stock_percentage = float(analysis['individual_stock_percentage'])
        
        if abs(target_stock_percentage - current_stock_percentage) > 1:  # 1% threshold
            target_stock_value = analysis['total_value'] * (Decimal(str(target_stock_percentage)) / Decimal('100'))
            current_stock_value = analysis['total_value'] * (Decimal(str(current_stock_percentage)) / Decimal('100'))
            difference = target_stock_value - current_stock_value
            
            action = "Add to" if difference > 0 else "Reduce"
            instructions.append(f"  {action} Individual Stocks: ${abs(difference):,.2f} " +
                                f"(from {current_stock_percentage:.1f}% to {target_stock_percentage:.1f}%)")
        
        # Add note if portfolio is reasonably aligned with target
        if len(instructions) <= 6:  # Only has summaries, no specific instructions
            instructions.append("  Your portfolio is already well-aligned with your target allocation.")
            
        return "\n".join(instructions)
    

# Additional portfolio analysis functions for advanced reporting

@dataclass
class PortfolioMetrics:
    """Comprehensive portfolio metrics for analysis and reporting."""
    # Basic stats
    total_value: Decimal
    cash_value: Decimal = Decimal('0')
    invested_value: Decimal = Decimal('0')
    
    # Allocation stats
    asset_class_values: Dict[AssetClass, Decimal] = None
    asset_class_percentages: Dict[AssetClass, Decimal] = None
    security_type_values: Dict[SecurityType, Decimal] = None
    security_type_percentages: Dict[SecurityType, Decimal] = None
    
    # Performance stats 
    total_gain_loss: Decimal = Decimal('0')
    total_gain_loss_percent: Decimal = Decimal('0')
    annualized_return: Optional[Decimal] = None
    period_return: Optional[Decimal] = None
    
    # Risk metrics
    risk_score: Optional[Decimal] = None  # Scale of 1-10
    sharpe_ratio: Optional[Decimal] = None
    volatility: Optional[Decimal] = None
    
    # Diversification metrics
    diversification_score: Optional[Decimal] = None  # Scale of 1-10
    concentration_risk: Optional[Dict[str, Decimal]] = None  # Highest concentration areas
    
    # Attribution
    asset_class_attribution: Optional[Dict[AssetClass, Decimal]] = None  # Performance attribution by asset class
    
    def __post_init__(self):
        """Initialize any missing dictionaries."""
        if self.asset_class_values is None:
            self.asset_class_values = {}
        if self.asset_class_percentages is None:
            self.asset_class_percentages = {}
        if self.security_type_values is None:
            self.security_type_values = {}
        if self.security_type_percentages is None:
            self.security_type_percentages = {}
        if self.concentration_risk is None:
            self.concentration_risk = {}
        if self.asset_class_attribution is None:
            self.asset_class_attribution = {}


class PortfolioAnalyticsEngine:
    """Advanced portfolio analytics including risk, diversification, and returns attribution."""
    
    @classmethod
    def calculate_diversification_score(cls, positions: List[PortfolioPosition]) -> Decimal:
        """Calculate a diversification score from 1-10 based on portfolio composition.
        
        Higher scores indicate better diversification across asset classes and securities.
        The calculation considers:
        1. Number of different asset classes
        2. Distribution across asset classes
        3. Number of securities within each asset class
        4. Concentration in individual positions
        
        Args:
            positions: List of portfolio positions
            
        Returns:
            Decimal: Diversification score from 1-10
        """
        if not positions:
            return Decimal('0')
            
        # Count asset classes and securities
        asset_classes = set()
        total_value = Decimal('0')
        position_percentages = []
        asset_class_values = {}
        
        # Gather data for calculations
        for position in positions:
            if position.asset_class:
                asset_classes.add(position.asset_class)
                asset_class_values[position.asset_class] = asset_class_values.get(position.asset_class, Decimal('0')) + position.market_value
                
            total_value += position.market_value
            position_percentages.append(position.market_value)
        
        # No positions or zero total value
        if total_value == Decimal('0'):
            return Decimal('1')  # Minimum score
        
        # Calculate metrics
        num_asset_classes = len(asset_classes)
        num_positions = len(positions)
        
        # 1. Asset class diversification (0-3 points)
        asset_class_score = min(num_asset_classes, 5) / 5 * 3
        
        # 2. Position concentration (0-4 points)
        # Higher HHI (Herfindahl-Hirschman Index) means more concentration
        position_weights = [p / total_value for p in position_percentages]
        hhi = sum(w * w for w in position_weights) * 10000  # Scale to 0-10000
        
        # Convert HHI to a score where lower HHI = higher score
        # For reference: HHI > 2500 is highly concentrated, < 1500 is competitive
        if hhi > 5000:  # Extremely concentrated
            concentration_score = 0
        elif hhi > 2500:  # Highly concentrated
            concentration_score = 1
        elif hhi > 1500:  # Moderately concentrated
            concentration_score = 2
        elif hhi > 750:  # Competitive
            concentration_score = 3
        else:  # Very diversified
            concentration_score = 4
            
        # 3. Asset class balance (0-3 points)
        if num_asset_classes <= 1:
            balance_score = 0
        else:
            # Calculate asset class weights
            asset_class_weights = [v / total_value for v in asset_class_values.values()]
            asset_class_hhi = sum(w * w for w in asset_class_weights) * 10000
            
            # Score based on asset class HHI
            if asset_class_hhi > 5000:
                balance_score = 0
            elif asset_class_hhi > 3500:
                balance_score = 1
            elif asset_class_hhi > 2500:
                balance_score = 2
            else:
                balance_score = 3
        
        # Combine scores and round to 1 decimal place
        final_score = asset_class_score + concentration_score + balance_score
        
        # Map to 1-10 scale (total possible is 10 points)
        return Decimal(str(min(max(round(final_score, 1), 1), 10)))
    
    @classmethod
    def calculate_risk_score(
        cls, 
        positions: List[PortfolioPosition],
        historical_volatility: Optional[Dict[str, float]] = None
    ) -> Decimal:
        """Calculate a risk score from 1-10 based on portfolio composition.
        
        Higher scores indicate higher risk. The calculation considers:
        1. Asset class allocation (e.g., more fixed income = lower risk)
        2. Security type allocation (e.g., individual stocks = higher risk)
        3. Historical volatility of specific securities if available
        
        Args:
            positions: List of portfolio positions
            historical_volatility: Optional dictionary mapping symbols to volatility values
            
        Returns:
            Decimal: Risk score from 1-10 where 10 is highest risk
        """
        if not positions:
            return Decimal('0')
            
        # Asset class risk weights (on a scale of 1-10)
        asset_class_risk = {
            AssetClass.CASH: 1,
            AssetClass.FIXED_INCOME: 3,
            AssetClass.REAL_ESTATE: 6,
            AssetClass.EQUITY: 8,
            AssetClass.COMMODITIES: 8,
            AssetClass.ALTERNATIVES: 9
        }
        
        # Security type modifiers (additive to the asset class risk)
        security_type_modifier = {
            SecurityType.MONEY_MARKET: -0.5,
            SecurityType.CERTIFICATE_OF_DEPOSIT: -0.5,
            SecurityType.BOND: 0,
            SecurityType.ETF: 0,
            SecurityType.INDEX_FUND: 0,
            SecurityType.MUTUAL_FUND: 0.5,
            SecurityType.REIT: 1,
            SecurityType.INDIVIDUAL_STOCK: 1.5,
            SecurityType.CRYPTOCURRENCY: 2,
            SecurityType.OPTIONS: 3
        }
        
        total_value = sum(position.market_value for position in positions)
        if total_value == Decimal('0'):
            return Decimal('0')
        
        # Calculate weighted risk score
        weighted_risk_score = Decimal('0')
        for position in positions:
            # Skip positions without asset class
            if not position.asset_class or not position.security_type:
                continue
                
            # Get base risk from asset class
            base_risk = asset_class_risk.get(position.asset_class, 5)
            
            # Apply security type modifier
            modifier = security_type_modifier.get(position.security_type, 0)
            position_risk = min(max(base_risk + modifier, 1), 10)  # Keep within 1-10 range
            
            # Apply position weight
            position_weight = position.market_value / total_value
            weighted_risk_score += Decimal(str(position_risk)) * position_weight
        
        # Round to 1 decimal place
        return Decimal(str(round(float(weighted_risk_score), 1)))
    
    @classmethod
    def calculate_returns_attribution(
        cls, 
        positions: List[PortfolioPosition]
    ) -> Dict[str, Dict]:
        """Calculate returns attribution by asset class and security type.
        
        Args:
            positions: List of portfolio positions
            
        Returns:
            Dict: Performance attribution data with absolute and percentage returns
                 by asset class and security type
        """
        # Initialize results structure
        attribution = {
            "asset_class": {},
            "security_type": {},
            "total": {
                "value": Decimal('0'),
                "gain_loss": Decimal('0'),
                "gain_loss_percent": Decimal('0')
            }
        }
        
        # Group by asset class and security type
        asset_class_data = {}
        security_type_data = {}
        
        total_value = Decimal('0')
        total_cost = Decimal('0')
        total_gain_loss = Decimal('0')
        
        for position in positions:
            # Skip positions without cost basis (can't calculate gain/loss)
            if position.cost_basis is None or position.unrealized_pl is None:
                continue
                
            total_value += position.market_value
            total_cost += position.cost_basis
            total_gain_loss += position.unrealized_pl
            
            # Attribution by asset class
            if position.asset_class:
                if position.asset_class not in asset_class_data:
                    asset_class_data[position.asset_class] = {
                        "value": Decimal('0'),
                        "cost": Decimal('0'),
                        "gain_loss": Decimal('0')
                    }
                asset_class_data[position.asset_class]["value"] += position.market_value
                asset_class_data[position.asset_class]["cost"] += position.cost_basis
                asset_class_data[position.asset_class]["gain_loss"] += position.unrealized_pl
            
            # Attribution by security type
            if position.security_type:
                if position.security_type not in security_type_data:
                    security_type_data[position.security_type] = {
                        "value": Decimal('0'),
                        "cost": Decimal('0'),
                        "gain_loss": Decimal('0')
                    }
                security_type_data[position.security_type]["value"] += position.market_value
                security_type_data[position.security_type]["cost"] += position.cost_basis
                security_type_data[position.security_type]["gain_loss"] += position.unrealized_pl
        
        # Calculate total gain/loss percent if we have valid cost basis
        total_gain_loss_percent = (total_gain_loss / total_cost * 100) if total_cost > 0 else Decimal('0')
        
        # Set total attribution
        attribution["total"] = {
            "value": total_value,
            "gain_loss": total_gain_loss,
            "gain_loss_percent": total_gain_loss_percent
        }
        
        # Calculate percentages for asset classes
        for asset_class, data in asset_class_data.items():
            gain_loss_percent = (data["gain_loss"] / data["cost"] * 100) if data["cost"] > 0 else Decimal('0')
            contribution_percent = (data["gain_loss"] / total_gain_loss * 100) if total_gain_loss != 0 else Decimal('0')
            
            attribution["asset_class"][asset_class] = {
                "value": data["value"],
                "gain_loss": data["gain_loss"],
                "gain_loss_percent": gain_loss_percent,
                "contribution_percent": contribution_percent
            }
        
        # Calculate percentages for security types
        for security_type, data in security_type_data.items():
            gain_loss_percent = (data["gain_loss"] / data["cost"] * 100) if data["cost"] > 0 else Decimal('0')
            contribution_percent = (data["gain_loss"] / total_gain_loss * 100) if total_gain_loss != 0 else Decimal('0')
            
            attribution["security_type"][security_type] = {
                "value": data["value"],
                "gain_loss": data["gain_loss"],
                "gain_loss_percent": gain_loss_percent,
                "contribution_percent": contribution_percent
            }
            
        return attribution
    
    @classmethod
    def identify_concentration_risks(cls, positions: List[PortfolioPosition]) -> Dict[str, Decimal]:
        """Identify concentration risks in the portfolio.
        
        This method looks for areas where the portfolio has high concentration:
        - Single positions that exceed thresholds (e.g., >5% of portfolio)
        - Heavy concentration in a single asset class or security type
        
        Args:
            positions: List of portfolio positions
            
        Returns:
            Dict: Concentration risks with percentage values
        """
        concentration_risks = {}
        
        total_value = sum(position.market_value for position in positions)
        if total_value == Decimal('0'):
            return concentration_risks
            
        # Check for large individual positions (>5%)
        position_weights = []
        for position in positions:
            weight = position.market_value / total_value * 100
            if weight > Decimal('5'):
                position_weights.append((position.symbol, weight))
        
        # Sort by weight descending
        position_weights.sort(key=lambda x: x[1], reverse=True)
        
        # Take top 5 largest positions
        for symbol, weight in position_weights[:5]:
            concentration_risks[f"Position: {symbol}"] = weight
            
        # Check for asset class concentration (>70%)
        asset_class_values = {}
        for position in positions:
            if position.asset_class:
                asset_class_values[position.asset_class] = asset_class_values.get(position.asset_class, Decimal('0')) + position.market_value
        
        for asset_class, value in asset_class_values.items():
            weight = value / total_value * 100
            if weight > Decimal('70'):
                asset_class_name = asset_class.value.replace('_', ' ').title()
                concentration_risks[f"Asset Class: {asset_class_name}"] = weight
                
        return concentration_risks
    
    @classmethod
    def generate_complete_portfolio_metrics(
        cls, 
        positions: List[PortfolioPosition],
        cash_value: Decimal = Decimal('0')
    ) -> PortfolioMetrics:
        """Generate comprehensive portfolio metrics.
        
        This method combines all analysis methods to produce a complete
        set of portfolio metrics.
        
        Args:
            positions: List of portfolio positions
            cash_value: Optional cash value in the portfolio
            
        Returns:
            PortfolioMetrics: Comprehensive portfolio metrics
        """
        # Run basic portfolio analysis first
        basic_analysis = PortfolioAnalyzer.analyze_portfolio(positions)
        
        # Calculate total portfolio value including cash
        total_value = basic_analysis['total_value'] + cash_value
        
        # Calculate risk score 
        risk_score = cls.calculate_risk_score(positions)
        
        # Calculate diversification score
        diversification_score = cls.calculate_diversification_score(positions)
        
        # Calculate returns attribution
        returns_attribution = cls.calculate_returns_attribution(positions)
        
        # Calculate concentration risks
        concentration_risk = cls.identify_concentration_risks(positions)
        
        # Create asset class attribution dict
        asset_class_attribution = {}
        if 'asset_class' in returns_attribution:
            for asset_class, data in returns_attribution['asset_class'].items():
                if 'contribution_percent' in data:
                    asset_class_attribution[asset_class] = data['contribution_percent']
        
        # Calculate total gain/loss
        total_gain_loss = Decimal('0')
        total_cost = Decimal('0')
        
        for position in positions:
            if position.cost_basis is not None and position.unrealized_pl is not None:
                total_gain_loss += position.unrealized_pl
                total_cost += position.cost_basis
                
        total_gain_loss_percent = (total_gain_loss / total_cost * 100) if total_cost > 0 else Decimal('0')
        
        # Create comprehensive metrics
        return PortfolioMetrics(
            total_value=total_value,
            cash_value=cash_value,
            invested_value=basic_analysis['total_value'],
            asset_class_values=basic_analysis['asset_class_values'],
            asset_class_percentages={k: v for k, v in basic_analysis['asset_class_percentages'].items()},
            security_type_values=basic_analysis['security_type_values'],
            security_type_percentages={k: v for k, v in basic_analysis['security_type_percentages'].items()},
            total_gain_loss=total_gain_loss,
            total_gain_loss_percent=total_gain_loss_percent,
            risk_score=risk_score,
            diversification_score=diversification_score,
            concentration_risk=concentration_risk,
            asset_class_attribution=asset_class_attribution
        )
    
    @classmethod
    def format_portfolio_summary(cls, metrics: PortfolioMetrics, investment_strategy: Dict = None) -> str:
        """Format portfolio metrics into a readable summary.
        
        Args:
            metrics: Portfolio metrics
            investment_strategy: Optional user investment strategy
            
        Returns:
            str: Formatted portfolio summary
        """
        summary = []
        
        # Portfolio value
        summary.append(f"# Portfolio Summary")
        summary.append(f"Total Portfolio Value: ${float(metrics.total_value):,.2f}")
        
        if metrics.cash_value > 0:
            cash_percentage = metrics.cash_value / metrics.total_value * 100
            summary.append(f"Cash: ${float(metrics.cash_value):,.2f} ({float(cash_percentage):.1f}%)")
            summary.append(f"Invested: ${float(metrics.invested_value):,.2f} ({float(100 - cash_percentage):.1f}%)")
        
        # Investment strategy
        if investment_strategy:
            summary.append(f"\n## Investment Strategy")
            summary.append(f"Risk Profile: {investment_strategy.get('risk_profile', 'Unknown').title()}")
            
            if 'target_portfolio' in investment_strategy:
                target = investment_strategy['target_portfolio']
                if 'name' in target:
                    summary.append(f"Target Portfolio: {target['name']}")
                
                # Add target allocations if available
                allocations = []
                if 'equity_percentage' in target and target['equity_percentage'] > 0:
                    allocations.append(f"Equity: {target['equity_percentage']:.1f}%")
                if 'fixed_income_percentage' in target and target['fixed_income_percentage'] > 0:
                    allocations.append(f"Fixed Income: {target['fixed_income_percentage']:.1f}%")
                if 'cash_percentage' in target and target['cash_percentage'] > 0:
                    allocations.append(f"Cash: {target['cash_percentage']:.1f}%")
                
                if allocations:
                    summary.append("Target Allocation: " + ", ".join(allocations))
        
        # Asset allocation
        summary.append(f"\n## Asset Allocation")
        for asset_class, percentage in metrics.asset_class_percentages.items():
            if float(percentage) > 0:
                asset_value = metrics.asset_class_values.get(asset_class, Decimal('0'))
                asset_class_name = asset_class.value.replace('_', ' ').title()
                summary.append(f"{asset_class_name}: ${float(asset_value):,.2f} ({float(percentage):.1f}%)")
        
        # Security types
        summary.append(f"\n## Security Types")
        for security_type, percentage in metrics.security_type_percentages.items():
            if float(percentage) > 0:
                security_type_name = security_type.value.replace('_', ' ').title()
                summary.append(f"{security_type_name}: {float(percentage):.1f}%")
        
        # Performance
        summary.append(f"\n## Performance")
        if metrics.total_gain_loss != 0:
            gain_or_loss = "Gain" if metrics.total_gain_loss >= 0 else "Loss"
            summary.append(f"Total {gain_or_loss}: ${float(abs(metrics.total_gain_loss)):,.2f} ({float(metrics.total_gain_loss_percent):.2f}%)")
            
            # Add attribution if available
            if metrics.asset_class_attribution:
                summary.append(f"\nPerformance Attribution by Asset Class:")
                # Sort by contribution (absolute value, descending)
                sorted_attribution = sorted(
                    metrics.asset_class_attribution.items(), 
                    key=lambda x: abs(float(x[1])), 
                    reverse=True
                )
                for asset_class, contribution in sorted_attribution:
                    if float(contribution) != 0:
                        asset_class_name = asset_class.value.replace('_', ' ').title()
                        summary.append(f"{asset_class_name}: {float(contribution):.1f}% contribution")
        
        # Risk and diversification
        summary.append(f"\n## Risk Assessment")
        if metrics.risk_score is not None:
            risk_level = "Low" if metrics.risk_score < 3 else "Medium" if metrics.risk_score < 7 else "High"
            summary.append(f"Risk Score: {float(metrics.risk_score):.1f}/10 ({risk_level})")
            
        if metrics.diversification_score is not None:
            div_level = "Poor" if metrics.diversification_score < 3 else "Moderate" if metrics.diversification_score < 7 else "Good"
            summary.append(f"Diversification Score: {float(metrics.diversification_score):.1f}/10 ({div_level})")
        
        # Concentration risks
        if metrics.concentration_risk:
            summary.append(f"\n## Concentration Risks")
            for risk, value in metrics.concentration_risk.items():
                summary.append(f"{risk}: {float(value):.1f}%")
        
        return "\n".join(summary)


